import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as path from "path";
import { Construct } from "constructs";

const integrationsResponse = [
  {
    statusCode: "200",
    responseParameters: {
      "method.response.header.Access-Control-Allow-Origin":
        "'https://d28jittyj3mhp8.cloudfront.net'",
      "method.response.header.Access-Control-Allow-Headers":
        "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
      "method.response.header.Access-Control-Allow-Methods": "'GET,OPTIONS'",
    },
  },
];

const methodResponse = [
  {
    statusCode: "200",
    responseParameters: {
      "method.response.header.Access-Control-Allow-Origin": true,
      "method.response.header.Access-Control-Allow-Headers": true,
      "method.response.header.Access-Control-Allow-Methods": true,
    },
  },
];

export class ProductServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const productsTable = new dynamodb.Table(this, "ProductsTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      tableName: "products",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const stockTable = new dynamodb.Table(this, "StockTable", {
      partitionKey: { name: "product_id", type: dynamodb.AttributeType.STRING },
      tableName: "stock",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const getProductsListLambda = new lambda.Function(
      this,
      "GetProductsListFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "get-products-list/handler.handler",
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        code: lambda.Code.fromAsset(path.join(__dirname, "lambdas")),
        environment: {
          PRODUCTS_TABLE_NAME: productsTable.tableName,
          STOCK_TABLE_NAME: stockTable.tableName,
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
        },
      }
    );

    const getProductsByIdLambda = new lambda.Function(
      this,
      "GetProductsByIdFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "get-products-by-id/handler.handler",
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        code: lambda.Code.fromAsset(path.join(__dirname, "lambdas")),
        environment: {
          PRODUCTS_TABLE_NAME: productsTable.tableName,
          STOCK_TABLE_NAME: stockTable.tableName,
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
        },
      }
    );

    const createProductLambda = new lambda.Function(
      this,
      "CreateProductFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "create-product/handler.handler",
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        code: lambda.Code.fromAsset(path.join(__dirname, "lambdas")),
        environment: {
          PRODUCTS_TABLE_NAME: productsTable.tableName,
          STOCK_TABLE_NAME: stockTable.tableName,
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
        },
      }
    );

    const swaggerDocsLambda = new lambda.Function(this, "SwaggerDocsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "swagger/handler.handler",
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      code: lambda.Code.fromAsset(path.join(__dirname, "lambdas")),
    });

    productsTable.grantReadWriteData(getProductsListLambda);
    stockTable.grantReadWriteData(getProductsListLambda);

    productsTable.grantReadWriteData(getProductsByIdLambda);
    stockTable.grantReadWriteData(getProductsByIdLambda);

    const api = new apigateway.RestApi(this, "ProductServiceApi", {
      restApiName: "Product Service API",
      description: "API for product service operations",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const productsResource = api.root.addResource("products");

    productsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getProductsListLambda, {
        integrationResponses: integrationsResponse,
      }),
      { methodResponses: methodResponse }
    );
    productsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createProductLambda, {
        integrationResponses: integrationsResponse,
      }),
      { methodResponses: methodResponse }
    );

    const productByIdResource = productsResource.addResource("{productId}");

    productByIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getProductsByIdLambda, {
        integrationResponses: integrationsResponse,
      }),
      { methodResponses: methodResponse }
    );

    const swaggerJsonResource = api.root.addResource("swagger");
    swaggerJsonResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(swaggerDocsLambda, {
        integrationResponses: integrationsResponse,
      }),
      { methodResponses: methodResponse }
    );

    new cdk.CfnOutput(this, "ProductServiceApiUrl", {
      value: api.url,
      description: "Product Service API Gateway URL",
    });

    new cdk.CfnOutput(this, "ProductsListEndpoint", {
      value: `${api.url}products`,
      description: "GET /products endpoint",
    });

    new cdk.CfnOutput(this, "ProductByIdEndpoint", {
      value: `${api.url}products/{productId}`,
      description: "GET /products/{productId} endpoint",
    });

    new cdk.CfnOutput(this, "SwaggerDocsEndpoint", {
      value: `${api.url}docs`,
      description: "Swagger UI documentation endpoint",
    });

    new cdk.CfnOutput(this, "SwaggerJsonEndpoint", {
      value: `${api.url}swagger.json`,
      description: "OpenAPI/Swagger JSON specification endpoint",
    });

    new cdk.CfnOutput(this, "ProductsTableName", {
      value: productsTable.tableName,
      description: "DynamoDB Products Table Name",
    });

    new cdk.CfnOutput(this, "StockTableName", {
      value: stockTable.tableName,
      description: "DynamoDB Stock Table Name",
    });
  }
}
