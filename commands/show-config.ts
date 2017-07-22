import * as util from 'util'
import * as yargs from 'yargs'
import * as common from '../lib/common'
import * as sender from '../lib/sender'

exports.command = 'show-config <s3Bucket>'
exports.desc = 'Print notification configurations of a S3Bucket.'
exports.handler = async function (argv) {
  try {
    const s3Path = common.parseS3Path(argv.s3Bucket)
    const s3 = common.getS3()
    const configuration = await s3.getBucketNotificationConfiguration({ Bucket: s3Path.bucket }).promise() 
    common.printNotificationConfig(configuration)
    console.log('')
  } catch (err) {
    console.error(err)
  }
}