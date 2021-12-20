import { Alarm } from "@aws-cdk/aws-cloudwatch";
import { FilterPattern, ILogGroup, MetricFilter } from "@aws-cdk/aws-logs";
import { ITopic } from "@aws-cdk/aws-sns";
import { Construct, Duration } from "@aws-cdk/core";
import { MetricAlarm } from "./metric-alarm";

export interface AlarmingLogAlarmProps {
  alarmPrefix: string;
  serviceName: string;
  logGroup: ILogGroup;
  exceptions?: string[];
  snsTopic: ITopic;
  warningThreshold: number;
  errorThreshold: number;
  errorsKibanaLink?: string;
  warningsKibanaLink?: string;
}

export class LogAlarm extends Construct {
  public readonly errorMetric: MetricFilter;
  public readonly warnMetric: MetricFilter;
  public readonly errorAlarm: Alarm;
  public readonly warnAlarm: Alarm;

  constructor(scope: Construct, id: string, props: AlarmingLogAlarmProps) {
    super(scope, id);
    this.errorMetric = this.createFilter("ERROR", props);
    this.errorAlarm = new MetricAlarm(scope, {
      metric: this.errorMetric.metric().with({ period: Duration.minutes(2) }),
      alarmDescription:
        `${props.serviceName} logged ERROR!` +
        LogAlarm.createKibanaLinkString(props.errorsKibanaLink),
      snsTopic: props.snsTopic,
      threshold: props.errorThreshold,
    });

    this.warnMetric = this.createFilter("WARN", props);
    this.warnAlarm = new MetricAlarm(scope, {
      metric: this.warnMetric.metric().with({ period: Duration.minutes(2) }),
      alarmDescription:
        `${props.serviceName} logged WARN!` +
        LogAlarm.createKibanaLinkString(props.warningsKibanaLink),
      snsTopic: props.snsTopic,
      threshold: props.warningThreshold,
    });
  }

  private static createKibanaLinkString(kibanaLink?: string) {
    if (kibanaLink) {
      return ` See Kibana: ${kibanaLink}`;
    }
    return "";
  }

  private createFilter(
    metricType: string,
    props: AlarmingLogAlarmProps
  ): MetricFilter {
    const metricTypeUpperCase = metricType.toUpperCase();

    const levelFilterPattern = FilterPattern.stringValue(
      "$.level",
      "=",
      `*${metricTypeUpperCase}`
    );
    let filterPattern = levelFilterPattern;
    if (!!props.exceptions) {
      const exceptionsFilterPatterns = props.exceptions?.map((exception) =>
        FilterPattern.stringValue("$.message", "!=", `*${exception}*`)
      );
      const exceptionsFilterPattern = FilterPattern.all(
        ...exceptionsFilterPatterns
      );
      filterPattern = FilterPattern.all(
        exceptionsFilterPattern,
        levelFilterPattern
      );
    }
    return new MetricFilter(
      this,
      `${props.logGroup.node.id}_${metricTypeUpperCase}_MetricsFilter`,
      {
        filterPattern,
        logGroup: props.logGroup,
        metricName: `${props.alarmPrefix.toLowerCase()}.${metricType.toLowerCase()}`,
        metricValue: "1",
        metricNamespace: `${props.serviceName.toLowerCase()}.logging`,
      }
    );
  }
}
