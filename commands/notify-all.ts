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
    .describe('dryrun', 'Do not send event')
  return yargs
}
exports.handler = async function (argv) {
  try {
    const s3Path = common.parseS3Path(argv.s3Path)
    const s3 = common.getS3()
    const sns = common.getSNS()
    const sqs = common.getSQS()
    const configuration = await s3.getBucketNotificationConfiguration({ Bucket: s3Path.bucket }).promise() 
    common.printNotificationConfig(configuration)
    console.log('')
    const numObjects = await common.forEachS3KeyInPrefix(s3, s3Path.bucket, s3Path.key, async function (object:AWS.S3.Object) {
      if (configuration.TopicConfigurations.length > 0) {
        if (argv.dryrun) {
          console.log(`(dryun) Send ${argv.event} SNS: ${object.Key}`)
        } else {
          console.log(`Send ${argv.event} SNS: ${object.Key}`)
          await sender.sendSNSWithTopicConfigurations(sns, {
            bucket: s3Path.bucket,
            eventName: argv.event,
            object: object,
            topicConfigs: configuration.TopicConfigurations
          })
        }
      }
      if (configuration.QueueConfigurations.length > 0) {
        if (argv.dryrun) {
          console.log(`(dryun) Send ${argv.event} SQS message: ${object.Key}`)
        } else {
          console.log(`Send ${argv.event} SQS message: ${object.Key}`)
          await sender.sendSQSWithQueueConfigurations(sqs, {
            bucket: s3Path.bucket,
            eventName: argv.event,
            object: object,
            queueConfigs: configuration.QueueConfigurations
          })
        }
      }
    })
    console.log(`Completed for ${numObjects} objects.`)
  } catch (err) {
    console.error(err)
  }
}