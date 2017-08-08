import * as AWS from 'aws-sdk'
import * as common from './common'

export interface SenderBaseInputParam {
  bucket:string
  eventName:string
  object:AWS.S3.Object
  dryrun?:boolean
}
export interface SendSNSWithTopicConfigurationsParam extends SenderBaseInputParam {
  topicConfigs:AWS.S3.TopicConfiguration[]
}
export interface SendSQSWithQueueConfigurationsParam extends SenderBaseInputParam {
  queueConfigs:AWS.S3.QueueConfiguration[]
}
export interface InvokeLambdaWithConfigurationsParam extends SenderBaseInputParam {
  lambdaConfigs:AWS.S3.LambdaFunctionConfiguration[]
}
export interface SendEventParam {
  bucket:string
  eventName:string
  object:AWS.S3.Object,
  filterRules:AWS.S3.FilterRule[]
  dryrun?:boolean
}
export interface SendEventResult {
  input:SendEventParam
  awsResponse?:any
  target:string
  sent:boolean
}

export function shouldSendEvent (object:AWS.S3.Object, filterRules:AWS.S3.FilterRule[]) {
  let valid = true
  filterRules.forEach((rule) => {
    if (rule.Name === 'prefix') {
      valid = object.Key.startsWith(rule.Value)
    } else {
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

export async function sendSNSWithTopicConfigurations (sns:AWS.SNS, param:SendSNSWithTopicConfigurationsParam):Promise<SendEventResult[]> {
  let promises = param.topicConfigs.map((topicConfig) => {
    return sendSNSNotification(sns, 'topicArn', topicConfig.TopicArn, {
      bucket: param.bucket,
      eventName: param.eventName,
      object: param.object,
      filterRules: topicConfig.Filter.Key.FilterRules,
      dryrun: param.dryrun
    })
  })
  return await Promise.all(promises)
}

export async function sendSNSNotification (sns:AWS.SNS, target:string, destination:string, param:SendEventParam):Promise<SendEventResult> {
  let result = { input: param, target: destination, sent: false, awsResponse: null }
  if (shouldSendEvent(param.object, param.filterRules)) {
    if (!param.dryrun) {
      const s3Event = common.constructS3Event(param.bucket, param.eventName, param.object)
      const messageBody = constructMessageBody(s3Event)
      switch (target) {
        case 'topicArn':
          result.awsResponse = await sns.publish({
            Subject: 'Amazon S3 Notification',
            TopicArn: destination,
            Message: messageBody
          }).promise()
          break;
        case 'targetArn':
          result.awsResponse = await sns.publish({
            Subject: 'Amazon S3 Notification',
            TargetArn: destination,
            Message: messageBody
          }).promise()
          break;
        case 'phoneNum':
          result.awsResponse = await sns.publish({
            Subject: 'Amazon S3 Notification',
            PhoneNumber: destination,
            Message: messageBody
          }).promise()
          break;
      }
    }
    result.sent = true
    return result
  }
  return result
}

export async function sendSQSWithQueueConfigurations (sqs:AWS.SQS, param:SendSQSWithQueueConfigurationsParam):Promise<SendEventResult[]> {
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

export async function sendSQSMessage (sqs:AWS.SQS, queueArn:string, param:SendEventParam):Promise<SendEventResult> {
  let result = { input: param, target: queueArn, sent: false, awsResponse: null }
  if (shouldSendEvent(param.object, param.filterRules)) {
    if (!param.dryrun) {
      const queueName = queueArn.split(':').pop()
      const queueUrlResult = await sqs.getQueueUrl({ QueueName: queueName }).promise()
      const s3Event = common.constructS3Event(param.bucket, param.eventName, param.object)
      const messageBody = constructMessageBody(s3Event)
      result.awsResponse = await sqs.sendMessage({
        QueueUrl: queueUrlResult.QueueUrl,
        MessageBody: messageBody
      }).promise()
    }
    result.sent = true
    return result
  }
  return result
}

export async function invokeLambdaWithConfigurations (lambda:AWS.Lambda, param:InvokeLambdaWithConfigurationsParam):Promise<SendEventResult[]> {
  let promises = param.lambdaConfigs.map((config) => {
    return invokeLambda(lambda, config.LambdaFunctionArn, 'Event', {
      bucket: param.bucket,
      eventName: param.eventName,
      object: param.object,
      filterRules: config.Filter.Key.FilterRules
    })
  })
  return await Promise.all(promises)
}

export async function invokeLambda (lambda:AWS.Lambda, functionArn:string, type:string, param:SendEventParam):Promise<SendEventResult> {
  let result = { input: param, target: functionArn, sent: false, awsResponse: null }
  if (shouldSendEvent(param.object, param.filterRules)) {
    if (!param.dryrun) {
      const s3Event = common.constructS3Event(param.bucket, param.eventName, param.object)
      const messageBody = constructMessageBody(s3Event)
      result.awsResponse = await lambda.invoke({
        FunctionName: functionArn,
        InvocationType: type,
        Payload: messageBody
      }).promise()
    }
    result.sent = true
    return result
  }
  return result
}
