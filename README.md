# s3events
Resend AWS S3 events to new or existing event handlers. Supports SNS, SQS, Lambda.

[![Build Status](https://travis-ci.org/yongfei25/s3events.svg?branch=master)](https://travis-ci.org/yongfei25/s3events)

## Usage
```bash
$ s3events --help
Commands:
  notify-all <event> <s3Path>               Send event for each object in the
                                            path, to all event handlers of the
                                            bucket (SNS,SQS,Lambda).
  notify-lambda <event> <functionArn>       Send event for each object in the
  <s3Path>                                  path, to a Lambda function.
  notify-sns <event> <topicArn> <s3Path>    Send event for each object in the
                                            path, to a SNS topic.
  notify-sqs <event> <queueArn> <s3Path>    Send event for each object in the
                                            path, to a SQS queue.
  show-config <s3Bucket>                    Print notification configurations of
                                            a S3Bucket.

Options:
  --help  Show help                                                    [boolean]

```

## Run from source
```bash
yarn
npm link --local
s3events --help
```
