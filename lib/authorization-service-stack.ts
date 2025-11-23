import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import { Construct } from "constructs";

export class AuthorizationServiceStack extends cdk.Stack {
  public readonly basicAuthorizerLambda: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.basicAuthorizerLambda = new lambda.Function(
      this,
      "BasicAuthorizerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "basic-authorizer/handler.handler",
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../dist/lib/lambdas")
        ),
        environment: {
          kas_s: "TEST_PASSWORD",
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
        },
        description: "Basic Authorization Lambda for API Gateway",
      }
    );

    new cdk.CfnOutput(this, "BasicAuthorizerFunctionArn", {
      value: this.basicAuthorizerLambda.functionArn,
      description: "ARN of the Basic Authorizer Lambda function",
      exportName: "BasicAuthorizerFunctionArn",
    });

    new cdk.CfnOutput(this, "BasicAuthorizerFunctionName", {
      value: this.basicAuthorizerLambda.functionName,
      description: "Name of the Basic Authorizer Lambda function",
    });
  }
}
