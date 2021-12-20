import { LogGroup } from "@aws-cdk/aws-logs";
import { Topic } from "@aws-cdk/aws-sns";
import * as cdk from "@aws-cdk/core";
import { Stack } from "@aws-cdk/core";
import { LogAlarm } from "..";

test("it should be possible to synthesize a stack with the library constructs", () => {
  //GIVEN
  const app = new cdk.App();
  // WHEN
  const stack = new Stack(app, "MyTestStack");

  new LogAlarm(stack, "testLogAlarm", {
    alarmPrefix: "test",
    logGroup: new LogGroup(stack, "testLogGroup"),
    serviceName: "test",
    snsTopic: new Topic(stack, "testTopic"),
    warningThreshold: 1,
    errorThreshold: 1,
  });

  new LogGroup(stack, "Test", {
    logGroupName: "test",
  });

  // THEN
  app.synth();
});
