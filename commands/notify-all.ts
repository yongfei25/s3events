import * as util from 'util'
import * as yargs from 'yargs'
import * as common from '../lib/common'
import * as sender from '../lib/sender'

exports.command = 'notify-all <event> <s3Path>'
exports.desc = 'Send event for each object in the path, to all event handlers of the bucket (SNS,SQS,Lambda).'
exports.builder = function (yargs:yargs.Argv) {
  yargs.demand(['event'])
    .choices('event', ['ObjectCreated:*', 'ObjectRemoved:*', 'ReducedRedundancyLostObject'])
    .describe('event', 'Event type')
    .describe('s3Path', 'Example: s3://prefix')
    .describe('dryrun', 'Do not send event')
  return yargs
}
exports.handler = async function (argv) {
  try {
    const s3Path = common.parseS3Path(argv.s3Path)
    const s3 = common.getS3()
    const sns = common.getSNS()
    const sqs = common.getSQS()
    const lambda = common.getLambda()
    const configuration = await s3.getBucketNotificationConfiguration({ Bucket: s3Path.bucket }).promise() 
    console.log(`Sending ${argv.event} event with the following configurations:\n`)
    common.printNotificationConfig(configuration)
    console.log('')
    const numObjects = await common.forEachS3KeyInPrefix(s3, s3Path.bucket, s3Path.key, async function (object:AWS.S3.Object) {
      await sendSns(sns, configuration.TopicConfigurations, argv.event, s3Path.bucket, object, argv.dryrun)
      await sendSqs(sqs, configuration.QueueConfigurations, argv.event, s3Path.bucket, object, argv.dryrun)
      await invokeLambda(lambda, configuration.LambdaFunctionConfigurations, argv.event, s3Path.bucket, object, argv.dryrun)
    })
    console.log(`Done. Scanned ${numObjects} objects in prefix.`)
  } catch (err) {
    console.error(err)
  }
}

async function sendSns (sns, topicConfigs, event, bucket, object, dryrun) {
  if (topicConfigs.length > 0) {
    const results = await sender.sendSNSWithTopicConfigurations(sns, {
      bucket: bucket,
      eventName: event,
      object: object,
      topicConfigs: topicConfigs,
      dryrun: dryrun
    })
    results.forEach((result) => {
      if (result.sent) {
        console.log(dryrun? '(dryrun)' : '', `SNS: "${result.input.object.Key}" -> "${result.target}"`)
      }
    })
  }
}

async function sendSqs (sqs, queueConfigs, event, bucket, object, dryrun) {
  if (queueConfigs.length > 0) {
    const results = await sender.sendSQSWithQueueConfigurations(sqs, {
      bucket: bucket,
      eventName: event,
      object: object,
      queueConfigs: queueConfigs,
      dryrun: dryrun
    })
    results.forEach((result) => {
      if (result.sent) {
        console.log(dryrun? '(dryrun)' : '', `SQS: "${result.input.object.Key}" -> "${result.target}"`)
      }
    })
  }
}

async function invokeLambda (lambda, lambdaConfigs, event, bucket, object, dryrun) {
  if (lambdaConfigs.length > 0) {
    const results = await sender.invokeLambdaWithConfigurations(lambda, {
      bucket: bucket,
      eventName: event,
      object: object,
      lambdaConfigs: lambdaConfigs,
      dryrun: dryrun
    })
    results.forEach((result) => {
      if (result.sent) {
        console.log(dryrun? '(dryrun)' : '', `Lambda: "${result.input.object.Key}" -> "${result.target}"`)
      }
    })
  }
}
