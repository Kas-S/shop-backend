import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { products } from "../shared/products-data";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("GetProductsList event:", JSON.stringify(event, null, 2));

  try {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://d28jittyj3mhp8.cloudfront.net",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: JSON.stringify(products),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
