import { UpdatePolicy } from "@aws-cdk/aws-autoscaling";
import {
  DnsValidatedCertificate,
  ICertificate,
} from "@aws-cdk/aws-certificatemanager";
import { InstanceType, Vpc } from "@aws-cdk/aws-ec2";
import * as awsEcs from "@aws-cdk/aws-ecs";
import { TaskDefinition } from "@aws-cdk/aws-ecs";
import { ApplicationLoadBalancedEc2Service } from "@aws-cdk/aws-ecs-patterns";
import { PlacementConstraint } from "@aws-cdk/aws-ecs/lib/placement";
import {
  ApplicationProtocol,
  IApplicationLoadBalancer,
  Protocol,
} from "@aws-cdk/aws-elasticloadbalancingv2";
import { ManagedPolicy } from "@aws-cdk/aws-iam";
import { LogGroup } from "@aws-cdk/aws-logs";
import { HostedZone, IHostedZone } from "@aws-cdk/aws-route53";
import { Bucket } from "@aws-cdk/aws-s3";
import { Construct, Duration, Fn, Stack, StackProps } from "@aws-cdk/core";
import { ECS_REMOVE_DEFAULT_DESIRED_COUNT } from "@aws-cdk/cx-api";
import { ServiceMonitoringAndAlarming } from "./service-monitoring-alarming";

interface AlbServiceProps extends StackProps {
  instanceType: InstanceType;
  accountNumber: string;
  accountAlias: string;
  serviceName: string;
  shortServiceName: string;
  taskDefinition: TaskDefinition;
  logGroup: LogGroup;
  region?: string;
  healthCheckEndpoint: string;
  loadBalancer?: IApplicationLoadBalancer;
  wafContextPath?: string;
  minTasksInService: number;
  maxTasksInService: number;
  maxBatchSize: number;
  publicLoadBalancer?: boolean;
  zone?: IHostedZone;
  openLister?: boolean;
  certificate?: ICertificate;
  errorsKibanaLink?: string;
  domainName: string;
  warningsKibanaLink?: string;
}

export class AlbService extends Construct {
  private readonly minInstancesInService: number;
  private readonly maxInstancesInService: number;
  private readonly applicationLoadBalancedEc2Service: ApplicationLoadBalancedEc2Service;

  constructor(scope: Stack, id: string, props: AlbServiceProps) {
    super(scope, id);
    // additionally remove desired count from service
    // https://github.com/aws/containers-roadmap/issues/493
    // https://github.com/aws/aws-cdk/pull/12223
    this.node.setContext(ECS_REMOVE_DEFAULT_DESIRED_COUNT, true);
    const zone = props.zone
      ? props.zone
      : HostedZone.fromLookup(this, "AccountZone", {
          domainName: props.domainName,
        });
    const domainName = `${props.shortServiceName.toLowerCase()}.${
      zone.zoneName
    }`;
    const certificate = props.certificate
      ? props.certificate
      : new DnsValidatedCertificate(this, props.serviceName + "DistCert", {
          domainName: domainName,
          hostedZone: zone,
        });
    this.minInstancesInService = props.minTasksInService;
    this.maxInstancesInService = props.maxTasksInService + props.maxBatchSize;
    const cluster = this.createEcsCluster(props);
    this.applicationLoadBalancedEc2Service =
      new ApplicationLoadBalancedEc2Service(this, "albService", {
        cluster,
        redirectHTTP: true,
        healthCheckGracePeriod: Duration.seconds(5),
        minHealthyPercent: 100,
        serviceName: props.serviceName,
        taskDefinition: props.taskDefinition,
        protocol: ApplicationProtocol.HTTPS,
        publicLoadBalancer: props.publicLoadBalancer
          ? props.publicLoadBalancer
          : false,
        listenerPort: 443,
        loadBalancer: props.loadBalancer,
        certificate: certificate,
        domainName: domainName,
        domainZone: zone,
        openListener: props.openLister,
        circuitBreaker: {
          rollback: true,
        },
      });
    this.applicationLoadBalancedEc2Service.service.addPlacementConstraints(
      PlacementConstraint.distinctInstances()
    );

    if (!props.loadBalancer) {
      this.enableElbAccessLogs();
    }
    this.applicationLoadBalancedEc2Service.targetGroup.setAttribute(
      "deregistration_delay.timeout_seconds",
      "60"
    );
    this.applicationLoadBalancedEc2Service.targetGroup.configureHealthCheck({
      protocol: Protocol.HTTP,
      path: props.healthCheckEndpoint,
      timeout: Duration.seconds(2),
      healthyThresholdCount: 5,
      interval: Duration.seconds(10),
    });

    new ServiceMonitoringAndAlarming(this, "serviceMonitoringAlarming", {
      accountNumber: props.accountNumber,
      accountAlias: props.accountAlias,
      serviceName: props.serviceName,
      alb: this.applicationLoadBalancedEc2Service.loadBalancer,
      targetGroup: this.applicationLoadBalancedEc2Service.targetGroup,
      logGroup: props.logGroup,
      cluster: cluster,
      region: props.region ? props.region : "eu-central-1",
      serviceNameShort: props.shortServiceName,
      errorsKibanaLink: props.errorsKibanaLink,
      warningsKibanaLink: props.warningsKibanaLink,
    });
  }

  private enableElbAccessLogs() {
    const logsBucketArn = Fn.importValue("LogsBucketArn");
    const logsBucket = Bucket.fromBucketArn(this, "logsBucket", logsBucketArn);
    this.applicationLoadBalancedEc2Service.loadBalancer.logAccessLogs(
      logsBucket,
      "elb-access-logs"
    );
  }

  private createEcsCluster(props: AlbServiceProps) {
    const vpc = Vpc.fromLookup(this, "ServiceVpc", {
      vpcName: "AccountInfrastructureStack/AccountVpc",
    });

    const cluster = new awsEcs.Cluster(this, props.serviceName + "Cluster", {
      clusterName: props.serviceName,
      containerInsights: true,
      vpc,
    });

    const asg = cluster.addCapacity("AutoScalingGroup", {
      instanceType: props.instanceType,
      minCapacity: this.minInstancesInService,
      maxCapacity: this.maxInstancesInService,
      maxInstanceLifetime: Duration.days(10),
      autoScalingGroupName: props.serviceName + "ASG",
      updateType: undefined,
      updatePolicy: UpdatePolicy.rollingUpdate({
        maxBatchSize: props.maxBatchSize,
        minInstancesInService: this.minInstancesInService,
        // minSuccessPercentage: 0.7,
      }),
    });

    asg.role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    asg.addUserData(
      'echo "___Setting kernel parameter overrides___"',
      'echo "net.core.somaxconn = 65536" > /etc/sysctl.d/99-perfoverrides.conf',
      'echo "net.ipv4.tcp_max_tw_buckets = 1440000" >> /etc/sysctl.d/99-perfoverrides.conf',
      'echo "net.ipv4.ip_local_port_range = 1024 65000" >> /etc/sysctl.d/99-perfoverrides.conf',
      'echo "net.ipv4.tcp_fin_timeout = 15" >> /etc/sysctl.d/99-perfoverrides.conf',
      'echo "net.ipv4.tcp_window_scaling = 1" >> /etc/sysctl.d/99-perfoverrides.conf',
      'echo "net.ipv4.tcp_max_syn_backlog = 3240000" >> /etc/sysctl.d/99-perfoverrides.conf',
      'echo "net.core.netdev_max_backlog = 3240000" >> /etc/sysctl.d/99-perfoverrides.conf',
      'echo "net.ipv4.tcp_tw_reuse = 3240000" >> /etc/sysctl.d/99-perfoverrides.conf',
      "sysctl --system"
    );

    const capacityProvider = new awsEcs.CfnCapacityProvider(
      this,
      "CapacityProvider",
      {
        autoScalingGroupProvider: {
          autoScalingGroupArn: asg.autoScalingGroupName,
          managedScaling: {
            maximumScalingStepSize: 10,
            minimumScalingStepSize: 1,
            status: "ENABLED",
            targetCapacity: 85,
          },
        },
      }
    );
    capacityProvider.node.addDependency(asg);

    new awsEcs.CfnClusterCapacityProviderAssociations(
      this,
      "CapacityProviderAssociation",
      {
        cluster: cluster.clusterName,
        capacityProviders: [capacityProvider.ref],
        defaultCapacityProviderStrategy: [
          {
            capacityProvider: capacityProvider.ref,
          },
        ],
      }
    );

    return cluster;
  }

  public getAlbService(): ApplicationLoadBalancedEc2Service {
    return this.applicationLoadBalancedEc2Service;
  }
}
