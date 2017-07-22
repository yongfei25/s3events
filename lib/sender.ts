import * as AWS from 'aws-sdk'
import * as common from './common'

export interface SendSNSWithTopicConfigurations {
  bucket:string
  eventName:string
  object:AWS.S3.Object
  topicConfigs:AWS.S3.TopicConfiguration[]
}

export interface SendSNSParam {
  bucket:string
  eventName:string
  object:AWS.S3.Object,
  filterRules:AWS.S3.FilterRule[]
  topicArn:string
}

export function shouldSendEvent (object:AWS.S3.Object, filterRules:AWS.S3.FilterRule[]) {
  let valid = true
  filterRules.forEach((rule) => {
    if (rule.Name === 'prefix') {
      valid = object.Key.startsWith(rule.Value)
    } else{
      valid = object.Key.endsWith(rule.Value)
    }
    if (!valid) {
      return false
    }
  })
  return valid
}

export async function sendSNSWithTopicConfigurations (sns:AWS.SNS, param:SendSNSWithTopicConfigurations) {
  let promises = param.topicConfigs.map((topicConfig) => {
    return sendSNSNotification(sns, {
      bucket: param.bucket,
      eventName: param.eventName,
      object: param.object,
      filterRules: topicConfig.Filter.Key.FilterRules,
      topicArn: topicConfig.TopicArn
    })
  })
  return await Promise.all(promises)
}

export async function sendSNSNotification (sns:AWS.SNS, param:SendSNSParam) {
  if (shouldSendEvent(param.object, param.filterRules)) {
    const s3Event = common.constructS3Event(param.bucket, param.eventName, param.object)
    const message = { Records: [ s3Event ]}
    const messageBody = JSON.stringify(message)
    await sns.publish({
      Subject: 'Amazon S3 Notification',
      TopicArn: param.topicArn,
      Message: messageBody
    }).promise()
  }
  return await Promise.resolve(true)
}