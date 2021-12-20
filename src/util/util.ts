import * as lambda from "@aws-cdk/aws-lambda";
import { ILogGroup } from "@aws-cdk/aws-logs";
import {
  BlockPublicAccess,
  Bucket,
  BucketAccessControl,
  BucketEncryption,
  ObjectOwnership,
} from "@aws-cdk/aws-s3";
import { Topic } from "@aws-cdk/aws-sns";
import { Construct, Fn, RemovalPolicy } from "@aws-cdk/core";
import { LogAlarm, MetricAlarm } from "..";

export interface BucketProps {
  objectOwnership?: ObjectOwnership;
}

export class Util {
  public static createEncryptedBucketWithSuffix(
    scope: Construct,
    suffix: string,
    account: string,
    serviceName: string,
    versioned = false
  ): Bucket {
    return new Bucket(scope, serviceName + "_" + suffix + "_Bucket", {
      encryption: BucketEncryption.KMS_MANAGED,
      bucketName: this.createBucketName(account, serviceName, suffix),
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      versioned: versioned,
    });
  }

  static createBucketName(
    account: string,
    serviceName: string,
    suffix: string
  ): string {
    return (
      "de-otto-" + account + "-funk-" + serviceName.toLowerCase() + "-" + suffix
    );
  }

  public static createEncryptedBucketWithSuffixNonBlocked(
    scope: Construct,
    suffix: string,
    account: string,
    serviceName: string,
    props?: BucketProps
  ): Bucket {
    return new Bucket(scope, serviceName + "_" + suffix + "_Bucket", {
      encryption: BucketEncryption.S3_MANAGED,
      bucketName: this.createBucketName(account, serviceName, suffix),
      accessControl: BucketAccessControl.PRIVATE,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
      objectOwnership: props?.objectOwnership,
    });
  }

  public static addAlarmingForLogGroup(
    scope: Construct,
    logGroup: ILogGroup,
    alarmPrefix: string,
    account: string,
    serviceName: string,
    errorsKibanaLink?: string,
    warningsKibanaLink?: string,
    warningThreshold = 1,
    errorThreshold = 1
  ): LogAlarm {
    const accountWideAlarmSnsTopicArn = Fn.importValue(
      `${account}-AlarmsTopic`
    );
    const snsTopic = Topic.fromTopicArn(
      scope,
      "AlarmsTopic_" + logGroup.node.id,
      accountWideAlarmSnsTopicArn
    );
    return new LogAlarm(scope, `LoggingAlarm_${logGroup.node.id}`, {
      logGroup: logGroup,
      serviceName: serviceName,
      snsTopic,
      alarmPrefix,
      warningThreshold,
      errorThreshold,
      errorsKibanaLink,
      warningsKibanaLink,
    });
  }

  public static addLambdaExecutionFailAlarming(
    scope: Construct,
    lambdaFunction: lambda.Function,
    functionName: string,
    account: string,
    serviceName: string,
    evaluationPeriod = 1
  ): MetricAlarm {
    const accountWideAlarmSnsTopicArn = Fn.importValue(
      `${account}-AlarmsTopic`
    );
    const snsTopic = Topic.fromTopicArn(
      scope,
      "AlarmsTopic_" + functionName,
      accountWideAlarmSnsTopicArn
    );
    const metric = lambdaFunction.metricErrors();

    return new MetricAlarm(scope, {
      snsTopic: snsTopic,
      alarmDescription: functionName + " has execution failure",
      metric: metric,
      alarmName: `${serviceName}.lambda.${functionName}.executionFailure`,
      threshold: 1,
      evaluationPeriods: evaluationPeriod,
    });
  }
}
