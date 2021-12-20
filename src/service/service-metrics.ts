import { Metric } from "@aws-cdk/aws-cloudwatch";
import {
  ApplicationLoadBalancer,
  ApplicationTargetGroup,
  HttpCodeElb,
  HttpCodeTarget,
} from "@aws-cdk/aws-elasticloadbalancingv2";
import { Construct, Duration } from "@aws-cdk/core";

export interface MonitoringAlarmingProps {
  alb: ApplicationLoadBalancer;
  targetGroup: ApplicationTargetGroup;
}
// https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-metrics.html
export class ServiceMetrics extends Construct {
  public static elb3XXMetric(props: MonitoringAlarmingProps): Metric {
    return props.alb.metricHttpCodeElb(HttpCodeElb.ELB_3XX_COUNT, {
      statistic: "Sum",
      period: Duration.minutes(1),
    });
  }
  public static elb4XXMetric(props: MonitoringAlarmingProps): Metric {
    return props.alb.metricHttpCodeElb(HttpCodeElb.ELB_4XX_COUNT, {
      statistic: "Sum",
      period: Duration.minutes(1),
    });
  }
  public static elb5XXMetric(props: MonitoringAlarmingProps): Metric {
    return props.alb.metricHttpCodeElb(HttpCodeElb.ELB_5XX_COUNT, {
      statistic: "Sum",
      period: Duration.minutes(1),
    });
  }
  public static target2XXMetric(props: MonitoringAlarmingProps): Metric {
    return props.targetGroup.metricHttpCodeTarget(
      HttpCodeTarget.TARGET_2XX_COUNT,
      {
        statistic: "Sum",
        period: Duration.minutes(1),
      }
    );
  }
  public static target3XXMetric(props: MonitoringAlarmingProps): Metric {
    return props.targetGroup.metricHttpCodeTarget(
      HttpCodeTarget.TARGET_3XX_COUNT,
      {
        statistic: "Sum",
        period: Duration.minutes(1),
      }
    );
  }
  public static target4XXMetric(props: MonitoringAlarmingProps): Metric {
    return props.targetGroup.metricHttpCodeTarget(
      HttpCodeTarget.TARGET_4XX_COUNT,
      {
        statistic: "Sum",
        period: Duration.minutes(1),
      }
    );
  }
  public static target5XXMetric(props: MonitoringAlarmingProps): Metric {
    return props.targetGroup.metricHttpCodeTarget(
      HttpCodeTarget.TARGET_5XX_COUNT,
      {
        statistic: "Sum",
        period: Duration.minutes(1),
      }
    );
  }
}
