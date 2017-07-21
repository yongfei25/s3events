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
    const numObjects = await common.forEachS3KeyInPrefix(s3, s3Path.bucket, s3Path.key, itemActionFunc)
    console.log('Done', numObjects)
  } catch (err) {
    console.error(err)
  }
}

async function itemActionFunc (bucket:string, object:AWS.S3.Object) {
  // TODO publish SNS here
  console.log(bucket, object.Key)
  return 1
}