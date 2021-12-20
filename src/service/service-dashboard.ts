import {
  Alarm,
  AlarmStatusWidget,
  Dashboard,
  GraphWidget,
  GraphWidgetView,
} from "@aws-cdk/aws-cloudwatch";
import { Cluster } from "@aws-cdk/aws-ecs";
import {
  ApplicationLoadBalancer,
  ApplicationTargetGroup,
} from "@aws-cdk/aws-elasticloadbalancingv2";
import { Construct, Duration } from "@aws-cdk/core";
import { ServiceMetrics } from "./service-metrics";

export interface DashboardProps {
  alb: ApplicationLoadBalancer;
  targetGroup: ApplicationTargetGroup;
  serviceName: string;
  serviceNameShort: string;
  cluster: Cluster;
  region: string;
  alarms: Alarm[];
}

export class ServiceDashboard extends Construct {
  private readonly dashboard: Dashboard;

  constructor(scope: Construct, id: string, props: DashboardProps) {
    super(scope, id);
    this.dashboard = new Dashboard(
      scope,
      props.serviceNameShort + "Dashboard",
      {
        dashboardName: props.serviceName,
        widgets: [
          [this.createHostWidget(props), this.createMemoryAndCpuWidget(props)],
          [this.createLatencyWidget(props), this.createConnectionWidget(props)],
          [
            this.createTargetResponseOkWidget(props),
            this.createElbResponseCodeWidget(props),
          ],
          [
            this.createNetworkWidget(props),
            this.createTargetResponseCodeWidget(props),
          ],
          [this.createAlarmWidget(scope, props)],
        ],
      }
    );
  }

  private createNetworkWidget(props: DashboardProps): GraphWidget {
    const processedBytes = props.alb.metricProcessedBytes({
      statistic: "avg",
      period: Duration.minutes(1),
    });

    return new GraphWidget({
      title: "Network Throughput",
      left: [processedBytes],
      view: GraphWidgetView.TIME_SERIES,
      height: 6,
      width: 12,
    });
  }

  private createHostWidget(props: DashboardProps): GraphWidget {
    const healthyHostCount = props.targetGroup.metricHealthyHostCount({
      period: Duration.minutes(1),
      statistic: "min",
    });

    const unhealthyHostCount = props.targetGroup.metricUnhealthyHostCount({
      period: Duration.minutes(1),
      statistic: "max",
    });

    return new GraphWidget({
      title: "Target Group Healthy vs Unhealthy",
      left: [healthyHostCount, unhealthyHostCount],
      view: GraphWidgetView.TIME_SERIES,
      height: 6,
      width: 12,
    });
  }

  private createMemoryAndCpuWidget(props: DashboardProps): GraphWidget {
    const cpuMax = props.cluster.metricCpuUtilization({
      period: Duration.seconds(1),
      statistic: "max",
    });

    const cpuAvg = props.cluster.metricCpuUtilization({
      period: Duration.minutes(1),
      statistic: "avg",
    });

    const memoryAvg = props.cluster.metricMemoryUtilization({
      period: Duration.minutes(1),
      statistic: "avg",
    });

    const memoryMax = props.cluster.metricMemoryUtilization({
      period: Duration.seconds(1),
      statistic: "max",
    });

    return new GraphWidget({
      title: "ECS Cluster Memory & CPU Usage",
      left: [cpuMax, cpuAvg, memoryAvg, memoryMax],
      view: GraphWidgetView.TIME_SERIES,
      height: 6,
      width: 12,
    });
  }

  private createLatencyWidget(props: DashboardProps): GraphWidget {
    const latencyP99 = props.alb.metricTargetResponseTime({
      statistic: "p99",
      period: Duration.minutes(1),
    });
    const latencyAvg = props.alb.metricTargetResponseTime({
      statistic: "avg",
      period: Duration.minutes(1),
    });
    const latencyMax = props.alb.metricTargetResponseTime({
      statistic: "max",
      period: Duration.minutes(1),
    });

    return new GraphWidget({
      title: "ALB Latency overview",
      left: [latencyP99, latencyAvg, latencyMax],
      view: GraphWidgetView.TIME_SERIES,
      height: 6,
      width: 12,
    });
  }

  private createTargetResponseOkWidget(props: DashboardProps): GraphWidget {
    return new GraphWidget({
      title: "Ok response count",
      left: [ServiceMetrics.target2XXMetric(props)],
      view: GraphWidgetView.TIME_SERIES,
      height: 6,
      width: 12,
    });
  }

  private createTargetResponseCodeWidget(props: DashboardProps): GraphWidget {
    return new GraphWidget({
      title: "Target response codes",
      left: [
        ServiceMetrics.target3XXMetric(props),
        ServiceMetrics.target4XXMetric(props),
        ServiceMetrics.target5XXMetric(props),
      ],
      view: GraphWidgetView.TIME_SERIES,
      height: 6,
      width: 12,
    });
  }

  private createElbResponseCodeWidget(props: DashboardProps): GraphWidget {
    return new GraphWidget({
      title: "Elb response codes",
      left: [
        ServiceMetrics.elb3XXMetric(props),
        ServiceMetrics.elb4XXMetric(props),
        ServiceMetrics.elb5XXMetric(props),
      ],
      view: GraphWidgetView.TIME_SERIES,
      height: 6,
      width: 12,
    });
  }

  private createConnectionWidget(props: DashboardProps): GraphWidget {
    const requestCount = props.alb.metricRequestCount({
      statistic: "sum",
      period: Duration.minutes(1),
    });

    const rejectedConnectionCount = props.alb.metricRejectedConnectionCount({
      statistic: "sum",
      period: Duration.minutes(1),
    });

    const activeConnectionCount = props.alb.metricActiveConnectionCount({
      statistic: "sum",
      period: Duration.minutes(1),
    });

    return new GraphWidget({
      title: "Connection overview",
      left: [requestCount, rejectedConnectionCount, activeConnectionCount],
      view: GraphWidgetView.TIME_SERIES,
      height: 6,
      width: 12,
    });
  }

  private createAlarmWidget(
    scope: Construct,
    props: DashboardProps
  ): AlarmStatusWidget {
    return new AlarmStatusWidget({
      alarms: props.alarms,
      height: 6,
      width: 12,
    });
  }
}
