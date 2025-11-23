import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as path from "path";
import { Construct } from "constructs";

export interface ImportServiceStackProps extends cdk.StackProps {
  catalogItemsQueue: sqs.Queue;
}

export class ImportServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ImportServiceStackProps) {
    super(scope, id, props);

    const basicAuthorizerLambda = new lambda.Function(
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
        description: "Basic Authorization Lambda for Import API Gateway",
      }
    );

    const bucket = new s3.Bucket(this, "products", {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
        },
      ],
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
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../dist/lib/lambdas")
        ),
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
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../dist/lib/lambdas")
        ),
        environment: {
          QUEUE_URL: props.catalogItemsQueue.queueUrl,
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
        },
      }
    );

    bucket.grantRead(importFileParserLambda);
    props.catalogItemsQueue.grantSendMessages(importFileParserLambda);

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

    const authorizer = new apigateway.TokenAuthorizer(this, "BasicAuthorizer", {
      handler: basicAuthorizerLambda,
      identitySource: "method.request.header.Authorization",
      authorizerName: "BasicAuthorizer",
      resultsCacheTtl: cdk.Duration.seconds(0),
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
              "method.response.header.Access-Control-Allow-Headers":
                "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
              "method.response.header.Access-Control-Allow-Methods":
                "'GET,OPTIONS'",
            },
          },
        ],
      }),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
              "method.response.header.Access-Control-Allow-Headers": true,
              "method.response.header.Access-Control-Allow-Methods": true,
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

    new cdk.CfnOutput(this, "BasicAuthorizerFunctionName", {
      value: basicAuthorizerLambda.functionName,
      description: "Lambda function that authorizes import API requests",
    });
  }
}
