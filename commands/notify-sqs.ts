import * as util from 'util'
import * as yargs from 'yargs'
import * as common from '../lib/common'
import * as sender from '../lib/sender'

exports.command = 'notify-sqs <event> <queueArn> <s3Path>'
exports.desc = 'Send event for each object in the path, to a SQS queue.'
exports.builder = function (yargs:yargs.Argv) {
  yargs.demand(['event'])
    .choices('event', ['ObjectCreated:*', 'ObjectRemoved:*', 'ReducedRedundancyLostObject'])
    .describe('event', 'Event type')
    .describe('queueArn', 'SQS queue ARN')
    .describe('s3Path', 'Example: s3://prefix')
    .describe('suffix', 'S3 key suffix')
    .describe('dryrun', 'Do not send event')
  return yargs
}
exports.handler = async function (argv) {
  try {
    const s3Path = common.parseS3Path(argv.s3Path)
    const s3 = common.getS3()
    const sqs = common.getSQS()
    let filterRules = []
    if (argv.suffix) {
      filterRules.push({ Name: 'Suffix', Value: argv.suffix })
    }
    const numObjects = await common.forEachS3KeyInPrefix(s3, s3Path.bucket, s3Path.key, async function (object:AWS.S3.Object) {
      let result = await sender.sendSQSMessage(sqs, argv.queueArn, {
        bucket: s3Path.bucket,
        eventName: argv.event,
        object: object,
        filterRules: filterRules,
        dryrun: argv.dryrun
      })
      if (result.sent) {
        console.log(argv.dryrun? '(dryrun)' : '', `SQS: "${result.input.object.Key}" -> "${result.target}"`)
      }
    })
    console.log(`Done. Scanned ${numObjects} objects in prefix.`)
  } catch (err) {
    console.error(err)
  }
}
