import * as AWS from 'aws-sdk'
import * as common from './common'

export interface SendSNSWithTopicConfigurationsParam {
  bucket:string
  eventName:string
  object:AWS.S3.Object
  topicConfigs:AWS.S3.TopicConfiguration[]
}
export interface SendSQSWithQueueConfigurationsParam {
  bucket:string
  eventName:string
  object:AWS.S3.Object
  queueConfigs:AWS.S3.QueueConfiguration[]
}
export interface SendEventParam {
  bucket:string
  eventName:string
  object:AWS.S3.Object,
  filterRules:AWS.S3.FilterRule[]
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

export function constructMessageBody (s3Event:common.S3Event) {
  return JSON.stringify({ Records: [ s3Event ]})
}

export async function sendSNSWithTopicConfigurations (sns:AWS.SNS, param:SendSNSWithTopicConfigurationsParam) {
  let promises = param.topicConfigs.map((topicConfig) => {
    return sendSNSNotification(sns, topicConfig.TopicArn, {
      bucket: param.bucket,
      eventName: param.eventName,
      object: param.object,
      filterRules: topicConfig.Filter.Key.FilterRules
    })
  })
  return await Promise.all(promises)
}

export async function sendSNSNotification (sns:AWS.SNS, topicArn:string, param:SendEventParam) {
  if (shouldSendEvent(param.object, param.filterRules)) {
    const s3Event = common.constructS3Event(param.bucket, param.eventName, param.object)
    const messageBody = constructMessageBody(s3Event)
    await sns.publish({
      Subject: 'Amazon S3 Notification',
      TopicArn: topicArn,
      Message: messageBody
    }).promise()
  }
  return await Promise.resolve(true)
}

export async function sendSQSWithQueueConfigurations (sqs:AWS.SQS, param:SendSQSWithQueueConfigurationsParam) {
  let promises = param.queueConfigs.map((queueConfig) => {
    return sendSQSMessage(sqs, queueConfig.QueueArn, {
      bucket: param.bucket,
      eventName: param.eventName,
      object: param.object,
      filterRules: queueConfig.Filter.Key.FilterRules
    })
  })
  return await Promise.all(promises)
}

export async function sendSQSMessage (sqs:AWS.SQS, queueArn:string, param:SendEventParam) {
  if (shouldSendEvent(param.object, param.filterRules)) {
    const queueName = queueArn.split(':').pop()
    const queueUrlResult = await sqs.getQueueUrl({ QueueName: queueName }).promise()
    const s3Event = common.constructS3Event(param.bucket, param.eventName, param.object)
    const messageBody = constructMessageBody(s3Event)
    await sqs.sendMessage({
      QueueUrl: queueUrlResult.QueueUrl,
      MessageBody: messageBody
    }).promise()
  }
  return await Promise.resolve(true)
}