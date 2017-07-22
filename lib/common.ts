import * as AWS from 'aws-sdk'
import * as url from 'url'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import * as ini from 'ini'

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

export function constructS3Event (bucket:string, eventName:string, object:AWS.S3.Object):S3Event {
  return {
    eventVersion: "2.0",
    eventName: eventName,
    eventTime: (new Date()).toISOString(),
    eventSource: 'aws:s3',
    s3: {
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

export async function forEachS3KeyInPrefix (s3:AWS.S3, bucket:string, prefix:string, func:S3KeyFunc):Promise<number> {
  let numObjects = 0
  let continuationToken:string|null = 'startToken'
  while (continuationToken) {
    let listResult = await s3.listObjectsV2({
      Bucket: bucket,
      Prefix: prefix.substr(1),
      MaxKeys: 1000,
      ContinuationToken: continuationToken === 'startToken'? undefined : continuationToken
    }).promise()
    let funcPromises = listResult.Contents.map((object) => {
      return func(object)
    })
    await Promise.all(funcPromises)
    numObjects += funcPromises.length
    if (listResult.IsTruncated) {
      continuationToken = listResult.ContinuationToken
    } else {
      continuationToken = null
    }
  }
  return numObjects
}