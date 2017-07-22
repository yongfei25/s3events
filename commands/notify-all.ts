import * as util from 'util'
import * as yargs from 'yargs'
import * as common from '../lib/common'
import * as sender from '../lib/sender'

exports.command = 'notify-all <event> <s3Path>'
exports.desc = 'Send event for each object in the path, to all event handlers of the S3 bucket.'
exports.builder = function (yargs:yargs.Argv) {
  yargs.demand(['event'])
    .choices('event', ['ObjectCreated:*', 'ObjectRemoved:*', 'ReducedRedundancyLostObject'])
    .describe('event', 'Event type')
  return yargs
}
exports.handler = async function (argv) {
  try {
    console.log('Triggering SNS for', argv.s3Path)
    const s3Path = common.parseS3Path(argv.s3Path)
    const s3 = common.getS3()
    const sns = common.getSNS()
    const configuration = await s3.getBucketNotificationConfiguration({ Bucket: s3Path.bucket }).promise() 
    const topicConfigurations = configuration.TopicConfigurations
    const numObjects = await common.forEachS3KeyInPrefix(s3, s3Path.bucket, s3Path.key, async function (object:AWS.S3.Object) {
      return await sender.sendSNSWithTopicConfigurations(sns, {
        bucket: s3Path.bucket,
        eventName: argv.event,
        object: object,
        topicConfigs: configuration.TopicConfigurations
      })
    })
    console.log('Done', numObjects)
  } catch (err) {
    console.error(err)
  }
}