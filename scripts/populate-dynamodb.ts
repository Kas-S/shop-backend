import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});
const docClient = DynamoDBDocumentClient.from(client);

const PRODUCTS_TABLE_NAME = process.env.PRODUCTS_TABLE_NAME || "products";
const STOCK_TABLE_NAME = process.env.STOCK_TABLE_NAME || "stock";

const productsData = [
  {
    title: "iPhone 15 Pro",
    description:
      "Latest iPhone with A17 Pro chip, titanium design, and advanced camera system",
    price: 99999,
    count: 50,
  },
  {
    title: "Samsung Galaxy S24 Ultra",
    description:
      "Premium Android smartphone with S Pen, 200MP camera, and AI features",
    price: 119999,
    count: 35,
  },
  {
    title: 'MacBook Pro 14"',
    description:
      "Powerful laptop with M3 chip, stunning Liquid Retina XDR display",
    price: 199999,
    count: 25,
  },
  {
    title: "iPad Air",
    description:
      "Versatile tablet with M2 chip, perfect for creativity and productivity",
    price: 59999,
    count: 60,
  },
  {
    title: "AirPods Pro (2nd generation)",
    description:
      "Premium wireless earbuds with active noise cancellation and spatial audio",
    price: 24999,
    count: 100,
  },
  {
    title: "Sony WH-1000XM5",
    description:
      "Industry-leading noise canceling wireless headphones with exceptional sound quality",
    price: 39999,
    count: 45,
  },
  {
    title: "Dell XPS 13",
    description:
      "Ultra-portable laptop with stunning InfinityEdge display and powerful performance",
    price: 129999,
    count: 30,
  },
  {
    title: "Apple Watch Series 9",
    description:
      "Advanced health and fitness features with always-on Retina display",
    price: 39999,
    count: 75,
  },
  {
    title: "Nintendo Switch OLED",
    description: "Enhanced gaming console with vibrant 7-inch OLED screen",
    price: 34999,
    count: 40,
  },
  {
    title: "PlayStation 5",
    description:
      "Next-gen gaming console with ultra-high speed SSD and stunning graphics",
    price: 49999,
    count: 20,
  },
  {
    title: "Kindle Paperwhite",
    description:
      "Waterproof e-reader with glare-free display and weeks of battery life",
    price: 13999,
    count: 80,
  },
  {
    title: "GoPro HERO12 Black",
    description:
      "Waterproof action camera with 5.3K video and advanced stabilization",
    price: 39999,
    count: 55,
  },
  {
    title: "Bose SoundLink Flex",
    description:
      "Portable Bluetooth speaker with exceptional sound quality and durability",
    price: 14999,
    count: 90,
  },
  {
    title: "Logitech MX Master 3S",
    description:
      "Advanced wireless mouse with customizable buttons and precise tracking",
    price: 9999,
    count: 120,
  },
  {
    title: 'Samsung 55" QLED 4K TV',
    description:
      "Quantum dot technology delivers vibrant colors and deep blacks",
    price: 89999,
    count: 15,
  },
];

async function populateProducts() {
  console.log("Starting to populate products and stock tables...\n");

  let successCount = 0;
  let errorCount = 0;

  for (const product of productsData) {
    const productId = randomUUID();

    try {
      await docClient.send(
        new PutCommand({
          TableName: PRODUCTS_TABLE_NAME,
          Item: {
            id: productId,
            title: product.title,
            description: product.description,
            price: product.price,
          },
        })
      );

      await docClient.send(
        new PutCommand({
          TableName: STOCK_TABLE_NAME,
          Item: {
            product_id: productId,
            count: product.count,
          },
        })
      );

      successCount++;
      console.log(
        `✅ Added: ${product.title} (ID: ${productId}, Stock: ${product.count})`
      );
    } catch (error) {
      errorCount++;
      console.error(`❌ Failed to add ${product.title}:`, error);
    }
  }

  console.log(`\n========================================`);
  console.log(`✅ Successfully added: ${successCount} products`);
  console.log(`❌ Failed: ${errorCount} products`);
  console.log(`========================================\n`);
}

async function populateProductsBatch() {
  console.log(
    "Starting to populate products and stock tables using batch write...\n"
  );

  const productsRequests = [];
  const stockRequests = [];
  const productDetails = [];

  for (const product of productsData) {
    const productId = randomUUID();

    productsRequests.push({
      PutRequest: {
        Item: {
          id: productId,
          title: product.title,
          description: product.description,
          price: product.price,
        },
      },
    });

    stockRequests.push({
      PutRequest: {
        Item: {
          product_id: productId,
          count: product.count,
        },
      },
    });

    productDetails.push({
      id: productId,
      title: product.title,
      count: product.count,
    });
  }

  try {
    const productBatches = [];
    for (let i = 0; i < productsRequests.length; i += 25) {
      productBatches.push(productsRequests.slice(i, i + 25));
    }

    for (const batch of productBatches) {
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [PRODUCTS_TABLE_NAME]: batch,
          },
        })
      );
    }
    console.log(`✅ Batch inserted ${productsRequests.length} products`);

    const stockBatches = [];
    for (let i = 0; i < stockRequests.length; i += 25) {
      stockBatches.push(stockRequests.slice(i, i + 25));
    }

    for (const batch of stockBatches) {
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [STOCK_TABLE_NAME]: batch,
          },
        })
      );
    }
    console.log(`✅ Batch inserted ${stockRequests.length} stock records\n`);

    console.log("========================================");
    console.log("Products Added:");
    console.log("========================================");
    productDetails.forEach((p, index) => {
      console.log(`${index + 1}. ${p.title}`);
      console.log(`   ID: ${p.id}`);
      console.log(`   Stock: ${p.count} units\n`);
    });

    console.log(
      `✅ Successfully populated ${productsRequests.length} products with stock data!`
    );
  } catch (error) {
    console.error("❌ Error during batch write:", error);
    throw error;
  }
}

async function main() {
  const useBatchWrite = process.argv.includes("--batch");

  console.log("========================================");
  console.log("DynamoDB Tables Population Script");
  console.log("========================================");
  console.log(
    `Mode: ${
      useBatchWrite
        ? "Batch Write (faster)"
        : "Individual Writes (slower, safer)"
    }`
  );
  console.log(`Region: ${process.env.AWS_REGION || "us-east-1"}`);
  console.log(`Products Table: ${PRODUCTS_TABLE_NAME}`);
  console.log(`Stock Table: ${STOCK_TABLE_NAME}`);
  console.log("========================================\n");

  try {
    if (useBatchWrite) {
      await populateProductsBatch();
    } else {
      await populateProducts();
    }

    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("\n💥 Script failed with error:", error);
    process.exit(1);
  }
}

main();
