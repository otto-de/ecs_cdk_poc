import { Construct } from "@aws-cdk/core";
import { Alarm, Metric, TreatMissingData } from "@aws-cdk/aws-cloudwatch";
import { ITopic } from "@aws-cdk/aws-sns";
import { SnsAction } from "@aws-cdk/aws-cloudwatch-actions";

export interface MetricAlarmProps {
  snsTopic: ITopic;
  metric: Metric;
  alarmDescription: string;
  alarmName?: string;
  threshold: number;
  evaluationPeriods?: number;
  treatMissingData?: TreatMissingData;
}

export class MetricAlarm extends Alarm {
  constructor(scope: Construct, props: MetricAlarmProps) {
    const alarmName = props.alarmName
      ? props.alarmName
      : props.metric.namespace.toLowerCase() + "." + props.metric.metricName;

    super(scope, alarmName, {
      alarmName: alarmName,
      alarmDescription: props.alarmDescription,
      metric: props.metric,
      threshold: props.threshold,
      evaluationPeriods: props.evaluationPeriods || 1,
      treatMissingData: props.treatMissingData
        ? props.treatMissingData
        : TreatMissingData.NOT_BREACHING,
    });
    const snsAction = new SnsAction(props.snsTopic);
    this.addOkAction(snsAction);
    this.addAlarmAction(snsAction);
  }
}
