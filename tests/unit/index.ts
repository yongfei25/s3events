import * as assert from 'assert'
import * as mocha from 'mocha'
import * as AWS from 'aws-sdk'
import * as common from '../../lib/common'
import * as sender from '../../lib/sender'

const REGION = 'us-east-1'
const TEST_BUCKET = 's3events-test'
const TEST_SNS_TOPIC = 'S3EventsSNSTopic'
const TEST_SQS_QUEUE = 'S3EventsSQSQueue'
const s3 = new AWS.S3({
  region: REGION,
  endpoint: 'http://0.0.0.0:4572',
  s3ForcePathStyle: true
})
const lambda = new AWS.Lambda({
  region: REGION,
  endpoint: 'http://0.0.0.0:4574'
})
const sns = new AWS.SNS({
  region: REGION,
  apiVersion: '2010-03-31',
  endpoint: 'http://0.0.0.0:4575'
})
const sqs = new AWS.SQS({
  region: REGION,
  endpoint: 'http://0.0.0.0:4576'
})
let topicArn:string
let queueUrl:string
let queueArn:string
let jsonFileObject:AWS.S3.Object = {
  Key: 'test-file.json'
}
let gzFileObject:AWS.S3.Object = {
  Key: 'test-file.gz'
}

before(async function () {
  let createTopic = await sns.createTopic({ Name: TEST_SNS_TOPIC }).promise()
  topicArn = createTopic.TopicArn
  let createQueue = await sqs.createQueue({ QueueName: TEST_SQS_QUEUE }).promise()
  queueUrl = createQueue.QueueUrl
  let parts = queueUrl.split('/')
  queueArn = ['arn', 'aws', 'sqs', REGION, parts[parts.length-2], parts[parts.length-1]].join(':')
  await s3.createBucket({ Bucket: TEST_BUCKET }).promise()
  await s3.upload({ Bucket: TEST_BUCKET, Key: 'test-file.json', Body: '{ "json": true }' }).promise()
  await s3.upload({ Bucket: TEST_BUCKET, Key: 'test-file.gz', Body: '{ "json": false }' }).promise()
})

describe('sender', function () {
  it('should send SQS message', async function () {
    await sender.sendSQSMessage(sqs, queueArn, {
      bucket: TEST_BUCKET,
      eventName: 'ObjectCreated:*',
      object: jsonFileObject,
      filterRules: []
    })
    let receiveMessage = await sqs.receiveMessage({ QueueUrl: queueUrl }).promise()
    assert(receiveMessage.Messages.length > 0)
    let message = receiveMessage.Messages[0]
    let messageBody = JSON.parse(message.Body)
    assert.equal(messageBody.Records[0].s3.object.key, jsonFileObject.Key)
    await sqs.deleteMessage({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }).promise()
  })
  it('should send SQS message with matched filter', async function () {
    await sender.sendSQSMessage(sqs, queueArn, {
      bucket: TEST_BUCKET,
      eventName: 'ObjectCreated:*',
      object: jsonFileObject,
      filterRules: [{ Name: 'Suffix', Value: 'json' }]
    })
    let receiveMessage = await sqs.receiveMessage({ QueueUrl: queueUrl }).promise()
    assert(receiveMessage.Messages.length > 0)
    let message = receiveMessage.Messages[0]
    let messageBody = JSON.parse(message.Body)
    assert.equal(messageBody.Records[0].s3.object.key, jsonFileObject.Key)
    await sqs.deleteMessage({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }).promise()
  })
  it('should not send SQS message with unmatched filter', async function () {
    await sender.sendSQSMessage(sqs, queueArn, {
      bucket: TEST_BUCKET,
      eventName: 'ObjectCreated:*',
      object: jsonFileObject,
      filterRules: [{ Name: 'Suffix', Value: 'gz' }]
    })
    let receiveMessage = await sqs.receiveMessage({ QueueUrl: queueUrl }).promise()
    assert.equal(receiveMessage.Messages, undefined)
  })
})
