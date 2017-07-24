# s3events
[![npm version](https://badge.fury.io/js/s3events.svg)](https://badge.fury.io/js/s3events)
[![Build Status](https://travis-ci.org/yongfei25/s3events.svg?branch=master)](https://travis-ci.org/yongfei25/s3events)

`s3events` is a command line tool to simulate and send AWS S3 events to new or existing event handlers. Supports SNS, SQS, Lambda.

## Sample use cases:
- Resend s3 object created events to event handlers.
- Simulate object removal events without deleting objects.

## Installation
```bash
npm install -g s3event
```

### Send object creation events in prefix to all attached event handlers
```bash
Usage: s3events notify-all <event> <s3Path>
--event   Event type[required] [choices: "ObjectCreated:*", "ObjectRemoved:*", "ReducedRedundancyLostObject"]
--s3Path  Example: s3://prefix

# Example
s3events notify-all ObjectCreated:* s3://bucket-name/data/2017/07/01/18

# Use --dryrun flag to see actions without sending notification
s3events notify-all ObjectCreated:* s3://bucket-name/data/2017/07/01/18 --dryrun
```

### Send object creation events in prefix to another SNS topic
```bash
Usage: s3events notify-sns <event> <topicArn> <s3Path>
--event     Event type
                    [required] [choices: "ObjectCreated:*", "ObjectRemoved:*", "ReducedRedundancyLostObject"]
--topicArn  SNS topic ARN
--s3Path    Example: s3://prefix

# Example
s3events notify-sns ObjectCreated:* arn:aws:sns:us-east-1:123456789:SNSTopicName s3://bucket-name/data/2017/07/01/18 --suffix sales.gz
```

## Usage Overview
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

# Running tests
export TMPDIR=/private$TMPDIR # OSX only
npm test
```
