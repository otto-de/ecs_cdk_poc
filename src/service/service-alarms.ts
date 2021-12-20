import {
  Alarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
} from "@aws-cdk/aws-cloudwatch";
import { Cluster } from "@aws-cdk/aws-ecs";
import {
  ApplicationLoadBalancer,
  ApplicationTargetGroup,
} from "@aws-cdk/aws-elasticloadbalancingv2";
import { ILogGroup } from "@aws-cdk/aws-logs";
import { ITopic, Topic } from "@aws-cdk/aws-sns";
import { Construct, Duration, Fn } from "@aws-cdk/core";
import { Util } from "../util";
import { MetricAlarm } from "../alarming";
import { ServiceMetrics } from "./service-metrics";

export interface AlarmsProps {
  logGroup: ILogGroup;
  alb: ApplicationLoadBalancer;
  targetGroup: ApplicationTargetGroup;
  cluster: Cluster;
  serviceName: string;
  accountNumber: string;
  accountAlias: string;
  errorsKibanaLink?: string;
  warningsKibanaLink?: string;
}

type AbnormalHttpResponseCode = 300 | 400 | 500;

// https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-metrics.html
export class ServiceAlarms extends Construct {
  private readonly snsTopic: ITopic;
  private readonly alarms: Alarm[] = [];
  private static readonly kibanaUrls: {
    [key: string]: {
      kibana: {
        pa: string;
        300: string;
        400: string;
        500: string;
        errorOrWarn: string;
      };
    };
  } = {
    live: {
      kibana: {
        pa: "https://blop.de/goto/9fd7ecb3730601a7d572b0387af4ea19",
        300: "https://blop/goto/1de400e45cd5e970947a12ee5a646317",
        400: "https://blop/goto/45cf2c4fe28d3082c87d5864d20945b8",
        500: "https://blop/goto/f57c997127fc2e4a8789b507cfd6e8aa",
        errorOrWarn: "https://blop/goto/f44fe4d7c2d024fce0ba3681571c592d",
      },
    },
    nonlive: {
      kibana: {
        pa: "https://kibana-pa-nonlive.live.logmon.cloud.otto.de/goto/d97d3fb81e82705b8cbfca2db8af3aa6",
        300: "https://blop/goto/f5df3e9023ac727f09d8bcbf7b6d1b25",
        400: "https://blop/goto/cf541b386a02a654ec799a646e1cd9ee",
        500: "https://blop/goto/167cb8177fb8a5afc721768ea94ae7bf",
        errorOrWarn: "https://blop/goto/ff01a6d90a34c5a462f2b4dd9886b053",
      },
    },
  };

  constructor(scope: Construct, id: string, props: AlarmsProps) {
    super(scope, id);
    this.snsTopic = Topic.fromTopicArn(
      this,
      "AlarmsTopic_Fullimport",
      Fn.importValue(`${props.accountNumber}-AlarmsTopic`)
    );
    ServiceAlarms.createWarnAndErrorLogsAlarm(scope, props);
    this.createAlbHttpRcAlarms(scope, props);
    this.createApplicationHttpRcAlarms(scope, props);
    this.createAlbRejectedConnectionsCountAlarm(scope, props);
    this.createP99Alarm(scope, props);
    this.createClusterAlarms(scope, props);
    this.createUnhealthyHostsCountAlarm(scope, props);
    scope.node.children.forEach((element) => {
      if (element instanceof Alarm) {
        this.alarms.push(element);
      }
    });
  }

  public getAlarms(): Alarm[] {
    return this.alarms;
  }

  private createAlbHttpRcAlarms(scope: Construct, props: AlarmsProps) {
    this.createAlbHttpRcAlarm(
      scope,
      ServiceMetrics.elb3XXMetric(props),
      300,
      false,
      props
    );
    this.createAlbHttpRcAlarm(
      scope,
      ServiceMetrics.elb5XXMetric(props),
      500,
      true,
      props
    );
  }

  private createAlbHttpRcAlarm(
    scope: Construct,
    backendResponseCountMetric: Metric,
    httpResponseCode: AbnormalHttpResponseCode,
    isSpoc: boolean,
    props: AlarmsProps
  ) {
    const environmentType = props.accountAlias === "live" ? "live" : "nonlive";
    new MetricAlarm(scope, {
      alarmDescription: this.createHttpRcAlarmDescription(
        httpResponseCode,
        environmentType,
        "elb"
      ),
      alarmName: ServiceAlarms.prefixAlarmNameWithServiceNameStageAndSpoc(
        props.serviceName,
        props.accountAlias,
        isSpoc,
        `ALBTooMany${String(httpResponseCode)}`
      ),
      metric: backendResponseCountMetric,
      snsTopic: this.snsTopic,
      threshold: 10,
    });
  }

  private createApplicationHttpRcAlarms(scope: Construct, props: AlarmsProps) {
    ServiceAlarms.createApplication2xxAlarm(
      scope,
      ServiceMetrics.target2XXMetric(props),
      true,
      props
    );
    this.createApplicationHttpRcAlarm(
      scope,
      ServiceMetrics.target3XXMetric(props),
      300,
      false,
      props,
      10
    );
    this.createApplicationHttpRcAlarm(
      scope,
      ServiceMetrics.target4XXMetric(props),
      400,
      false,
      props,
      10000
    );
    this.createApplicationHttpRcAlarm(
      scope,
      ServiceMetrics.target5XXMetric(props),
      500,
      true,
      props,
      10
    );
  }

  private createApplicationHttpRcAlarm(
    scope: Construct,
    backendResponseCountMetric: Metric,
    httpResponseCode: AbnormalHttpResponseCode,
    isSpoc: boolean,
    props: AlarmsProps,
    threshold = 10
  ) {
    const environmentType = props.accountAlias === "live" ? "live" : "nonlive";
    new MetricAlarm(scope, {
      alarmDescription: this.createHttpRcAlarmDescription(
        httpResponseCode,
        environmentType,
        "application"
      ),
      alarmName: ServiceAlarms.prefixAlarmNameWithServiceNameStageAndSpoc(
        props.serviceName,
        props.accountAlias,
        isSpoc,
        `ApplicationTooMany${String(httpResponseCode)}`
      ),
      metric: backendResponseCountMetric,
      snsTopic: this.snsTopic,
      threshold: threshold,
    });
  }

  private createHttpRcAlarmDescription(
    httpResponseCode: AbnormalHttpResponseCode,
    environmentType: string,
    elbOrApplication: string
  ): string {
    return `There have been too many ${String(
      httpResponseCode
    )} response codes from ${elbOrApplication}. Investigate in kibana: ${
      ServiceAlarms.kibanaUrls[environmentType]["kibana"][httpResponseCode]
    }, investigate for errors or warns in kibana: ${
      ServiceAlarms.kibanaUrls[environmentType]["kibana"]["errorOrWarn"]
    } or in Kibana of pa: ${
      ServiceAlarms.kibanaUrls[environmentType].kibana.pa
    }`;
  }

  private static createApplication2xxAlarm(
    scope: Construct,
    backendResponseCountMetric: Metric,
    isSpoc: boolean,
    props: AlarmsProps
  ) {
    if (props.accountAlias === "live") {
      const alarmName =
        ServiceAlarms.prefixAlarmNameWithServiceNameStageAndSpoc(
          props.serviceName,
          props.accountAlias,
          isSpoc,
          `ApplicationTooFew200`
        );

      new Alarm(scope, alarmName, {
        alarmName: alarmName,
        alarmDescription: `There have been too few 200 responses from application`,
        metric: backendResponseCountMetric,
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        threshold: 5000,
        evaluationPeriods: 1,
        treatMissingData: TreatMissingData.BREACHING,
      });
    }
  }

  private static createWarnAndErrorLogsAlarm(
    scope: Construct,
    props: AlarmsProps
  ) {
    Util.addAlarmingForLogGroup(
      scope,
      props.logGroup,
      "service",
      props.accountNumber,
      props.serviceName,
      props.errorsKibanaLink,
      props.warningsKibanaLink
    );
  }

  private createUnhealthyHostsCountAlarm(scope: Construct, props: AlarmsProps) {
    new MetricAlarm(scope, {
      alarmDescription: `There have been too many unhealthy hosts for this service target`,
      alarmName: ServiceAlarms.prefixAlarmNameWithServiceNameStageAndSpoc(
        props.serviceName,
        props.accountAlias,
        true,
        `TooManyUnhealthyHosts`
      ),
      metric: props.targetGroup.metricUnhealthyHostCount(),
      snsTopic: this.snsTopic,
      threshold: 1,
    });
  }

  private createAlbRejectedConnectionsCountAlarm(
    scope: Construct,
    props: AlarmsProps
  ) {
    new MetricAlarm(scope, {
      alarmDescription: `There have been too many rejected connections from the ALB`,
      alarmName: ServiceAlarms.prefixAlarmNameWithServiceNameStageAndSpoc(
        props.serviceName,
        props.accountAlias,
        false,
        `TooManyRejectedConnections`
      ),
      metric: props.alb.metricRejectedConnectionCount({
        statistic: "Sum",
        period: Duration.minutes(1),
      }),
      snsTopic: this.snsTopic,
      threshold: 10,
    });
  }

  private createP99Alarm(scope: Construct, props: AlarmsProps) {
    new MetricAlarm(scope, {
      alarmDescription: `The p99 latency for this service is very high`,
      alarmName: ServiceAlarms.prefixAlarmNameWithServiceNameStageAndSpoc(
        props.serviceName,
        props.accountAlias,
        true,
        `P99Alarm`
      ),
      metric: props.alb.metricTargetResponseTime({
        statistic: "p99",
        period: Duration.minutes(1),
        dimensions: {
          TargetGroup: props.targetGroup.targetGroupFullName,
          LoadBalancer: props.alb.loadBalancerFullName,
        },
      }),
      snsTopic: this.snsTopic,
      threshold: 1,
    });
  }

  private createClusterAlarms(scope: Construct, props: AlarmsProps) {
    new MetricAlarm(scope, {
      alarmDescription: `High CPU Utilization in cluster`,
      alarmName: ServiceAlarms.prefixAlarmNameWithServiceNameStageAndSpoc(
        props.serviceName,
        props.accountAlias,
        false,
        `HIGHCPUUtilizationForService`
      ),
      metric: props.cluster.metricCpuUtilization({
        statistic: "Maximum",
        period: Duration.minutes(1),
      }),
      snsTopic: this.snsTopic,
      threshold: 80,
    });
    new MetricAlarm(scope, {
      alarmDescription: `High Memory Utilization in cluster`,
      alarmName: ServiceAlarms.prefixAlarmNameWithServiceNameStageAndSpoc(
        props.serviceName,
        props.accountAlias,
        false,
        `HIGHMemoryUtilizationForService`
      ),
      metric: props.cluster.metricMemoryUtilization({
        statistic: "Maximum",
        period: Duration.minutes(1),
      }),
      snsTopic: this.snsTopic,
      threshold: 80,
    });
  }

  private static prefixAlarmNameWithServiceNameStageAndSpoc(
    serviceName: string,
    stage: string,
    isSpoc: boolean,
    alarmName: string
  ): string {
    if (isSpoc) {
      return serviceName + "." + stage + ".SPOC." + alarmName;
    }
    return serviceName + "." + stage + "." + alarmName;
  }
}
