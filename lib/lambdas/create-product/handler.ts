import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Product } from "../../../scripts/types";
import { randomUUID } from "crypto";

const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE_NAME;
const STOCK_TABLE = process.env.STOCK_TABLE_NAME;

function isValidProductData(
  data: any
): data is Omit<Product, "id"> & { count?: number } {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof data.title === "string" &&
    data.title.trim().length > 0 &&
    typeof data.description === "string" &&
    typeof data.price === "number" &&
    data.price > 0
  );
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("CreateProduct event:", JSON.stringify(event, null, 2));

  try {
    const data = JSON.parse(event.body || "{}");

    if (!isValidProductData(data)) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          message:
            "Invalid product data. Required: title (string), description (string), price (positive number)",
        }),
      };
    }

    const productId = randomUUID();
    const count = typeof data.count === "number" ? data.count : 0;

    const product: Product = {
      id: productId,
      title: data.title,
      description: data.description,
      price: data.price,
    };

    await docClient.send(
      new PutCommand({
        TableName: PRODUCTS_TABLE,
        Item: product,
      })
    );

    await docClient.send(
      new PutCommand({
        TableName: STOCK_TABLE,
        Item: {
          product_id: productId,
          count: count,
        },
      })
    );

    return {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        ...product,
        count: count,
      }),
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
