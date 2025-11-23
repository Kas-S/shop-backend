import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

import { SWAGGER_UI_HTML, swaggerSpec } from "./constants";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const path = event.path;
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    };

    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers,
        body: "",
      };
    }

    if (path.endsWith("/swagger.json") || path.endsWith("/openapi.json")) {
      return {
        statusCode: 200,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(swaggerSpec, null, 2),
      };
    }

    if (
      path.endsWith("/docs") ||
      path.endsWith("/swagger") ||
      path.endsWith("/api-docs")
    ) {
      return {
        statusCode: 200,
        headers: {
          ...headers,
          "Content-Type": "text/html",
        },
        body: SWAGGER_UI_HTML,
      };
    }

    return {
      statusCode: 200,
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        {
          message: "Product Service API Documentation",
          endpoints: {
            swagger_ui: `${event.requestContext.domainName}${event.requestContext.stage}/docs`,
            swagger_json: `${event.requestContext.domainName}${event.requestContext.stage}/swagger.json`,
            openapi_json: `${event.requestContext.domainName}${event.requestContext.stage}/openapi.json`,
          },
          version: "1.0.0",
        },
        null,
        2
      ),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
