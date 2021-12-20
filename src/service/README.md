# Constructs for an ECS/EC2 based ALB (Application Load Balancer) service

These are the constructs for building an ecs service based on ec2 not fargate.

## Troubleshooting

In case you have issues deploying such a service, you could try the following:

- Disable the circuit breaker. It is intended for a production setup but if you are still buidling your service it will keep your cloudformation resources from stabilizing and it will be hard to check cloudwatch logs or anything of the sort. You can reenable it when everything works as expected.

- If your service has no running tasks, one of the reasons could be that the allocated hardware resources are not sufficient. One way of checking that is checking our the events of the ECS service. In the AWS ECS console, first open the cluster, then locate the service and click it. Under the events tab you will see relevant events that may aid troubleshooting the issues.

- It is highly recommended to configure ECS container health checks in addition to the load balancer healthcheck. In case you decide for it, make sure not to forget to include the command that you use for the healthcheck in your container/image otherwise your healthcheck will fail without obvious reason.

- If you decide to set up an internal https load balancer with a private hosted zone, keep in mind that you can not use the DnsValidatedCertificate cdk construct because the dns verification will fail (the dns records are not public). Accordingly, you could reuse a certificate that is intended for the public hosted zone as long as your private zone is a sub zone of your public hosted zone or they are named the same.
