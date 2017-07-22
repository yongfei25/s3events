import * as util from 'util'
import * as yargs from 'yargs'
import * as common from '../lib/common'
import * as sender from '../lib/sender'

exports.command = 'notify-lambda <event> <functionArn> <s3Path>'
exports.desc = 'Send event for each object in the path, to a Lambda function.'
exports.builder = function (yargs:yargs.Argv) {
  yargs.demand(['event'])
    .choices('event', ['ObjectCreated:*', 'ObjectRemoved:*', 'ReducedRedundancyLostObject'])
    .describe('event', 'Event type')
    .describe('functionArn', 'Lambda function ARN')
    .describe('s3Path', 'Example: s3://prefix')
    .describe('suffix', 'S3 key suffix')
    .describe('dryrun', 'Do not send event')
  return yargs
}
exports.handler = async function (argv) {
  try {
    const s3Path = common.parseS3Path(argv.s3Path)
    const s3 = common.getS3()
    const lambda = common.getLambda()
    const numObjects = await common.forEachS3KeyInPrefix(s3, s3Path.bucket, s3Path.key, async function (object:AWS.S3.Object) {
      let filterRules = []
      if (argv.suffix) {
        filterRules.push({ Name: 'Suffix', Value: argv.suffix })
      }
      if (argv.dryrun) {
        console.log(`(dryrun) Invoke ${argv.functionArn} ${argv.event} for ${object.Key}`)
      } else {
        console.log(`Invoke ${argv.functionArn} ${argv.event} for ${object.Key}`)
        await sender.invokeLambda(lambda, argv.functionArn, {
          bucket: s3Path.bucket,
          eventName: argv.event,
          object: object,
          filterRules: filterRules
        })
      }
    })
    console.log(`Completed for ${numObjects} objects.`)
  } catch (err) {
    console.error(err)
  }
}
