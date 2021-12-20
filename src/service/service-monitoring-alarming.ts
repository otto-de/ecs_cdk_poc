import { Cluster } from "@aws-cdk/aws-ecs";
import {
  ApplicationLoadBalancer,
  ApplicationTargetGroup,
} from "@aws-cdk/aws-elasticloadbalancingv2";
import { ILogGroup } from "@aws-cdk/aws-logs";
import { Construct } from "@aws-cdk/core";
import { ServiceAlarms } from "./service-alarms";
import { ServiceDashboard } from "./service-dashboard";

export interface MonitoringAlarmingProps {
  logGroup: ILogGroup;
  alb: ApplicationLoadBalancer;
  targetGroup: ApplicationTargetGroup;
  cluster: Cluster;
  serviceName: string;
  serviceNameShort: string;
  accountNumber: string;
  accountAlias: string;
  region: string;
  errorsKibanaLink?: string;
  warningsKibanaLink?: string;
}
// https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-metrics.html
export class ServiceMonitoringAndAlarming extends Construct {
  constructor(scope: Construct, id: string, props: MonitoringAlarmingProps) {
    super(scope, id);
    const serviceAlarms = new ServiceAlarms(
      scope,
      id + "_serviceAlarms",
      props
    );
    new ServiceDashboard(scope, id + "_serviceDashboard", {
      ...props,
      alarms: serviceAlarms.getAlarms(),
    });
  }
}
