import * as AWS from 'aws-sdk'
import * as url from 'url'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import * as ini from 'ini'

const chunk = require('lodash.chunk')
const CHUNK_SIZE = 30

export interface S3Path {
  bucket:string
  key:string
}

export interface S3KeyFunc {
  (object:AWS.S3.Object):Promise<any>
}

export interface S3Event {
  eventVersion:string
  eventName:string
  eventTime:string
  eventSource:string
  s3:{
    s3SchemaVersion:string
    bucket:{
      name:string
      arn:string
    },
    object:{
      key:string
      size:number
      etag:string
    }
  }
}

export function parseS3Path (s3Path:string):S3Path {
  if (!s3Path.startsWith('s3://')) {
    s3Path = 's3://' + s3Path
  }
  let parsed = url.parse(s3Path)
  return {
    bucket: parsed.host,
    key: parsed.path
  }
}

export function getRegionOrDefault(defRegion:string):string {
  try {
    const configPath = path.join(os.homedir(), '.aws', 'config')
    const profile = process.env.AWS_PROFILE || 'default'
    const config = ini.parse(fs.readFileSync(configPath, 'utf-8'))
    const region = config[`profile ${profile}`] ? config[`profile ${profile}`].region : defRegion
    return region
  } catch (err) {
    return defRegion
  }
}

export function getS3 ():AWS.S3 {
  const region = getRegionOrDefault('us-east-1')
  return new AWS.S3({
    apiVersion: '2006-03-01',
    region: region
  })
}

export function getSNS ():AWS.SNS {
  const region = getRegionOrDefault('us-east-1')
  return new AWS.SNS({
    apiVersion: '2010-03-31',
    region: region
  })
}

export function getSQS ():AWS.SQS {
  const region = getRegionOrDefault('us-east-1')
  return new AWS.SQS({
    apiVersion: '2012-11-05',
    region: region
  })
}

export function getLambda ():AWS.Lambda {
  const region = getRegionOrDefault('us-east-1')
  return new AWS.Lambda({
    apiVersion: '2015-03-31',
    region: region
  })
}

export function constructS3Event (bucket:string, eventName:string, object:AWS.S3.Object):S3Event {
  return {
    eventVersion: "2.0",
    eventName: `s3:${eventName}`,
    eventTime: (new Date()).toISOString(),
    eventSource: 'aws:s3',
    s3: {
      s3SchemaVersion: '1.0',
      bucket: {
        name: bucket,
        arn: `arn:aws:s3:::${bucket}`
      },
      object: {
        key: object.Key,
        size: object.Size,
        etag: object.ETag
      }
    }
  }
}

export function printNotificationConfig(config:AWS.S3.NotificationConfiguration) {
  let filterRuleString = (filterRules:AWS.S3.FilterRule[]) => {
    return filterRules.reduce((prev, current) => {
      return prev + ` ${current.Name}=${current.Value}`
    }, '')
  }

  if (config.TopicConfigurations.length > 0) {
    console.log('SNS:')
    config.TopicConfigurations.forEach((config) => {
      const filterRule = filterRuleString(config.Filter.Key.FilterRules)
      console.log('-', config.TopicArn, filterRule)
    })
  }

  if (config.QueueConfigurations.length > 0) {
    console.log('SQS:')
    config.QueueConfigurations.forEach((config) => {
      const filterRule = filterRuleString(config.Filter.Key.FilterRules)
      console.log('-', config.QueueArn, filterRule)
    })
  }

  if (config.LambdaFunctionConfigurations.length > 0) {
    console.log('Lambda:')
    config.LambdaFunctionConfigurations.forEach((config) => {
      const filterRule = filterRuleString(config.Filter.Key.FilterRules)
      console.log('-', config.LambdaFunctionArn, filterRule)
    })
  }
}

export async function forEachS3KeyInPrefix (s3:AWS.S3, bucket:string, prefix:string, func:S3KeyFunc):Promise<number> {
  let numObjects = 0
  let continuationToken:string|null = 'startToken'
  while (continuationToken) {
    const listResult = await s3.listObjectsV2({
      Bucket: bucket,
      Prefix: prefix? prefix.substr(1) : '',
      ContinuationToken: continuationToken === 'startToken'? undefined : continuationToken
    }).promise()
    const batches = chunk(listResult.Contents, CHUNK_SIZE)
    for (let i=0; i<batches.length; i++) {
      const funcPromises = batches[i].map((object) => func(object))
      await Promise.all(funcPromises)
    }
    numObjects += listResult.Contents.length
    if (listResult.IsTruncated) {
      continuationToken = listResult.NextContinuationToken
    } else {
      continuationToken = null
    }
  }
  return numObjects
}
