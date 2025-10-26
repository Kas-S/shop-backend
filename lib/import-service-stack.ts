import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as path from "path";
import { Construct } from "constructs";

export class ImportServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const bucket = new s3.Bucket(this, "products", {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new s3deploy.BucketDeployment(this, "UploadedFolder", {
      sources: [s3deploy.Source.data("uploaded/.keep", " ")],
      destinationBucket: bucket,
    });

    const importProductsFileLambda = new lambda.Function(
      this,
      "ImportProductsFileFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "import-products-file/handler.handler",
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        code: lambda.Code.fromAsset(path.join(__dirname, "lambdas")),
        environment: {
          BUCKET_NAME: bucket.bucketName,
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
        },
      }
    );

    bucket.grantPut(importProductsFileLambda);
    bucket.grantRead(importProductsFileLambda);

    const importFileParserLambda = new lambda.Function(
      this,
      "ImportFileParserFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "import-file-parser/handler.handler",
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        code: lambda.Code.fromAsset(path.join(__dirname, "lambdas")),
        environment: {
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
        },
      }
    );

    bucket.grantRead(importFileParserLambda);

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(importFileParserLambda),
      { prefix: "uploaded/" }
    );

    const api = new apigateway.RestApi(this, "ImportServiceApi", {
      restApiName: "Import Service API",
      description: "API for product import operations",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const importResource = api.root.addResource("import");

    importResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(importProductsFileLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      }
    );

    new cdk.CfnOutput(this, "ImportServiceApiUrl", {
      value: api.url,
      description: "Import Service API Gateway URL",
    });

    new cdk.CfnOutput(this, "ImportEndpoint", {
      value: `${api.url}import`,
      description: "GET /import endpoint",
    });

    new cdk.CfnOutput(this, "ImportFileParserFunctionName", {
      value: importFileParserLambda.functionName,
      description: "Lambda function that parses uploaded CSV files",
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
      description: "S3 Bucket for product imports",
    });
  }
}
