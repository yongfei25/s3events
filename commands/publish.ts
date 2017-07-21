import * as util from 'util'
import * as common from '../lib/common'

exports.command = 'publish-sns <s3Path> [snstopic]'
exports.desc = 'Publish create event to SNS topics'
exports.handler = async function (argv) {
  try {
    console.log('Triggering SNS for', argv.s3Path)
    const s3Path = common.parseS3Path(argv.s3Path)
    const s3 = common.getS3()
    const configuration = await s3.getBucketNotificationConfiguration({ Bucket: s3Path.bucket }).promise() 
    const topicConfigurations = configuration.TopicConfigurations
    const numObjects = await common.forEachS3KeyInPrefix(s3, s3Path.bucket, s3Path.key, async function (bucket:string, object:AWS.S3.Object) {
      return await publishNotifications(bucket, object, topicConfigurations)
    })
    console.log('Done', numObjects)
  } catch (err) {
    console.error(err)
  }
}

async function publishNotifications (bucket:string, object:AWS.S3.Object, topicConfigs:AWS.S3.TopicConfiguration[]) {
  let promises = topicConfigs.map((topicConfig) => {
    return publishOneNotification(bucket, object, topicConfig)
  })
  return await Promise.all(promises)
}

async function publishOneNotification (bucket:string, object:AWS.S3.Object, topicConfig:AWS.S3.TopicConfiguration) {
  if (common.shouldPublishEvent(object, topicConfig.Filter.Key.FilterRules)) {
    console.log('Publish SNS', object.Key, topicConfig.TopicArn)
  }
  return await Promise.resolve(true)
}