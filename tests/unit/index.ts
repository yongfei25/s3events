import * as assert from 'assert'
import * as mocha from 'mocha'
import * as path from 'path'
import * as fs from 'fs'
import * as zlib from 'zlib'
import * as AWS from 'aws-sdk'
import * as common from '../../lib/common'
import * as sender from '../../lib/sender'

const REGION = 'us-east-1'
const TEST_BUCKET = 's3events-test'
const TEST_SNS_TOPIC = 'S3EventsSNSTopic'
const TEST_SQS_QUEUE = 'S3EventsSQSQueue'

AWS.config.update({
  accessKeyId: 'foo',
  secretAccessKey: 'bar',
  region: REGION
})
const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  endpoint: 'http://0.0.0.0:4572',
  s3ForcePathStyle: true
})
const lambda = new AWS.Lambda({
  apiVersion: '2015-03-31',
  endpoint: 'http://0.0.0.0:4574'
})
const sns = new AWS.SNS({
  apiVersion: '2010-03-31',
  endpoint: 'http://0.0.0.0:4575'
})
const sqs = new AWS.SQS({
  apiVersion: '2012-11-05',
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
  // Create topc
  let createTopic = await sns.createTopic({ Name: TEST_SNS_TOPIC }).promise()
  topicArn = createTopic.TopicArn

  // Create queue
  let createQueue = await sqs.createQueue({ QueueName: TEST_SQS_QUEUE }).promise()
  queueUrl = createQueue.QueueUrl
  let parts = queueUrl.split('/')
  queueArn = ['arn', 'aws', 'sqs', REGION, parts[parts.length-2], parts[parts.length-1]].join(':')

  // Create subscription between SNS and SQS
  let subscribe = await sns.subscribe({ TopicArn: topicArn, Protocol: 'sqs', Endpoint: queueArn }).promise()

  // Create Lambda function
  await lambda.createFunction({
    FunctionName: 'HelloFunction',
    Handler: 'handler.hello',
    Role: 'AWSLambdaBasicExecutionRole',
    Runtime: 'python3.6',
    Code: {
      ZipFile: fs.readFileSync(path.join(__dirname, '../fixtures/handler.zip'))
    }
  }).promise()

  await s3.createBucket({ Bucket: TEST_BUCKET }).promise()
  await s3.upload({ Bucket: TEST_BUCKET, Key: 'test-file.json', Body: '{ "json": true }' }).promise()
  await s3.upload({ Bucket: TEST_BUCKET, Key: 'test-file.gz', Body: '{ "json": false }' }).promise()
  // TODO: Test S3 notification configuration
  // Not supported by localstack at the point of writing
  // Posibbily revisit the test case in future
})

describe('forEachS3KeyInPrefix', function () {
  it('should retrieve all s3 keys', async function () {
    let keys = []
    await common.forEachS3KeyInPrefix(s3, TEST_BUCKET, '/', async function (object) {
      keys.push(object.Key)
    })
    assert(keys.includes('test-file.json'))
    assert(keys.includes('test-file.gz'))
  })
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
    assert.equal(messageBody.Records[0].eventName, 's3:ObjectCreated:*')
    await sqs.deleteMessage({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }).promise()
  })
  it('should send SQS message with matched filter', async function () {
    let result = await sender.sendSQSMessage(sqs, queueArn, {
      bucket: TEST_BUCKET,
      eventName: 'ObjectCreated:*',
      object: jsonFileObject,
      filterRules: [{ Name: 'Suffix', Value: 'json' }]
    })
    let receiveMessage = await sqs.receiveMessage({ QueueUrl: queueUrl }).promise()
    assert(receiveMessage.Messages.length > 0)
    let message = receiveMessage.Messages[0]
    let messageBody = JSON.parse(message.Body)
    assert.equal(result.sent, true)
    assert.equal(messageBody.Records[0].s3.object.key, jsonFileObject.Key)
    await sqs.deleteMessage({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }).promise()
  })
  it('should not send SQS message with unmatched filter', async function () {
    let result = await sender.sendSQSMessage(sqs, queueArn, {
      bucket: TEST_BUCKET,
      eventName: 'ObjectCreated:*',
      object: jsonFileObject,
      filterRules: [{ Name: 'Suffix', Value: 'gz' }]
    })
    let receiveMessage = await sqs.receiveMessage({ QueueUrl: queueUrl }).promise()
    assert.equal(result.sent, false)
    assert.equal(receiveMessage.Messages, undefined)
  })
  it('should not send SQS message with dryrun option', async function () {
    await sender.sendSQSMessage(sqs, queueArn, {
      bucket: TEST_BUCKET,
      eventName: 'ObjectCreated:*',
      object: gzFileObject,
      filterRules: [{ Name: 'Suffix', Value: 'gz' }],
      dryrun: true
    })
    let receiveMessage = await sqs.receiveMessage({ QueueUrl: queueUrl }).promise()
    assert.equal(receiveMessage.Messages, undefined)
  })
  it('should publish SNS notification', async function () {
    await sender.sendSNSNotification(sns, topicArn, {
      bucket: TEST_BUCKET,
      eventName: 'ObjectRemoved:*',
      object: jsonFileObject,
      filterRules: [{ Name: 'prefix', Value: 'test-file' }]
    })
    let receiveMessage = await sqs.receiveMessage({ QueueUrl: queueUrl }).promise()
    assert(receiveMessage.Messages.length > 0)
    let message = receiveMessage.Messages[0]
    let snsMessage = JSON.parse(message.Body)
    let s3Message = JSON.parse(snsMessage.Message)
    assert.equal(snsMessage.TopicArn, topicArn)
    assert.equal(s3Message.Records[0].s3.object.key, jsonFileObject.Key)
    assert.equal(s3Message.Records[0].eventName, 's3:ObjectRemoved:*')
    await sqs.deleteMessage({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }).promise()
  })
  it('should not publish SNS notification with dryrun option', async function () {
    await sender.sendSNSNotification(sns, topicArn, {
      bucket: TEST_BUCKET,
      eventName: 'ObjectRemoved:*',
      object: jsonFileObject,
      filterRules: [{ Name: 'prefix', Value: 'test-file' }],
      dryrun: true
    })
    let receiveMessage = await sqs.receiveMessage({ QueueUrl: queueUrl }).promise()
    assert.equal(receiveMessage.Messages, undefined)
  })
  it('should invoke Lambda function', async function () {
    let result = await sender.invokeLambda(lambda, 'HelloFunction', 'Event', {
      bucket: TEST_BUCKET,
      eventName: 'ObjectRemoved:*',
      object: jsonFileObject,
      filterRules: [{ Name: 'prefix', Value: 'test-file' }]
    })
    let invocation:AWS.Lambda.InvocationResponse = result.awsResponse
    let payload = JSON.parse(invocation.Payload as string)
    assert.equal(invocation.StatusCode, 200)
    assert.equal(payload.Records[0].s3.object.key, 'test-file.json')
  })
  it('should not invoke Lambda function with dryrun option', async function () {
    let result = await sender.invokeLambda(lambda, 'HelloFunction', 'Event', {
      bucket: TEST_BUCKET,
      eventName: 'ObjectRemoved:*',
      object: jsonFileObject,
      filterRules: [{ Name: 'prefix', Value: 'test-file' }],
      dryrun: true
    })
    assert.equal(result.awsResponse, null)
  })
})
