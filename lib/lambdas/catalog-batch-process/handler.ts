import { SQSEvent, SQSRecord } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { randomUUID } from "crypto";

const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE_NAME;
const STOCK_TABLE = process.env.STOCK_TABLE_NAME;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

interface ProductMessage {
  title: string;
  description: string;
  price: number;
  count?: number;
}

function parseProductData(data: any): ProductMessage {
  if (typeof data !== "object" || data === null) {
    throw new Error("Product data must be an object");
  }

  if (typeof data.title !== "string" || data.title.trim().length === 0) {
    throw new Error("Product title must be a non-empty string");
  }

  if (typeof data.description !== "string") {
    throw new Error("Product description must be a string");
  }

  // Parse price - handle both string and number types
  let price: number;
  if (typeof data.price === "number") {
    price = data.price;
  } else if (typeof data.price === "string") {
    price = parseFloat(data.price);
  } else {
    throw new Error("Product price must be a number or numeric string");
  }

  if (isNaN(price) || price <= 0) {
    throw new Error("Product price must be a positive number");
  }

  // Parse count - handle both string and number types
  let count: number | undefined;
  if (data.count !== undefined && data.count !== null && data.count !== "") {
    if (typeof data.count === "number") {
      count = data.count;
    } else if (typeof data.count === "string") {
      count = parseInt(data.count, 10);
      if (isNaN(count) || count < 0) {
        throw new Error("Product count must be a non-negative number");
      }
    } else {
      throw new Error("Product count must be a number or numeric string");
    }
  }

  return {
    title: data.title.trim(),
    description: data.description.trim(),
    price: price,
    count: count,
  };
}

export const handler = async (event: SQSEvent): Promise<void> => {
  console.log("CatalogBatchProcess event:", JSON.stringify(event, null, 2));
  console.log(`Processing ${event.Records.length} messages`);

  const createdProducts: Array<{
    id: string;
    title: string;
    price: number;
    count: number;
  }> = [];

  for (const record of event.Records) {
    try {
      const product = await processRecord(record);
      createdProducts.push(product);
    } catch (error) {
      console.error(`Error processing message ${record.messageId}:`, error);
      throw error;
    }
  }

  console.log(`Successfully processed ${event.Records.length} messages`);

  if (createdProducts.length > 0) {
    await sendProductCreatedNotification(createdProducts);
  }
};

async function processRecord(record: SQSRecord): Promise<{
  id: string;
  title: string;
  price: number;
  count: number;
}> {
  console.log(`Processing message: ${record.messageId}`);

  let rawData: any;

  try {
    rawData = JSON.parse(record.body);
  } catch (error) {
    console.error(`Invalid JSON in message ${record.messageId}:`, error);
    throw new Error("Invalid JSON format");
  }

  let productData: ProductMessage;
  try {
    productData = parseProductData(rawData);
  } catch (error) {
    console.error(
      `Invalid product data in message ${record.messageId}:`,
      rawData,
      `Error: ${error instanceof Error ? error.message : error}`
    );
    throw error;
  }

  const productId = randomUUID();
  const count = typeof productData.count === "number" ? productData.count : 0;

  console.log(`Creating product: ${productData.title} with ID: ${productId}`);

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: PRODUCTS_TABLE,
              Item: {
                id: productId,
                title: productData.title,
                description: productData.description,
                price: productData.price,
              },
            },
          },
          {
            Put: {
              TableName: STOCK_TABLE,
              Item: {
                product_id: productId,
                count: count,
              },
            },
          },
        ],
      })
    );

    console.log(
      `Successfully created product ${productId} with count ${count}`
    );

    return {
      id: productId,
      title: productData.title,
      price: productData.price,
      count: count,
    };
  } catch (error) {
    console.error(`Failed to create product ${productId}:`, error);
    throw error;
  }
}

async function sendProductCreatedNotification(
  products: Array<{
    id: string;
    title: string;
    price: number;
    count: number;
  }>
): Promise<void> {
  if (!SNS_TOPIC_ARN) {
    console.warn("SNS_TOPIC_ARN not configured, skipping notification");
    return;
  }

  const subject = `${products.length} New Product${
    products.length > 1 ? "s" : ""
  } Created`;

  const message = `
New products have been successfully created in the catalog:

${products
  .map(
    (p, index) => `
${index + 1}. ${p.title}
   - ID: ${p.id}
   - Price: $${p.price.toFixed(2)}
   - Stock Count: ${p.count}
`
  )
  .join("\n")}

Total products created: ${products.length}

This is an automated notification from the Product Catalog Service.
  `.trim();

  // Calculate the maximum price in this batch for filtering
  const maxPrice = Math.max(...products.map((p) => p.price));
  const isPremiumBatch = maxPrice > 100;

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: subject,
        Message: message,
        MessageAttributes: {
          price: {
            DataType: "Number",
            StringValue: maxPrice.toString(),
          },
          isPremium: {
            DataType: "String",
            StringValue: isPremiumBatch ? "true" : "false",
          },
          productCount: {
            DataType: "Number",
            StringValue: products.length.toString(),
          },
        },
      })
    );

    console.log(
      `SNS notification sent successfully for ${products.length} products (max price: $${maxPrice}, premium: ${isPremiumBatch})`
    );
  } catch (error) {
    console.error("Failed to send SNS notification:", error);
    // Don't throw error - we don't want to fail the Lambda if notification fails
  }
}
