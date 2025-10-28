#!/usr/bin/env ts-node
/**
 * Script to send test messages to the catalogItemsQueue SQS queue
 *
 * Usage:
 *   ts-node scripts/send-to-queue.ts
 */

import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || "us-east-1",
});

// Update this with your queue URL after deployment
const QUEUE_URL = process.env.QUEUE_URL || "YOUR_QUEUE_URL_HERE";

const sampleProducts = [
  {
    title: "Samsung Galaxy S21",
    description: "Latest Samsung flagship smartphone",
    price: 79999,
    count: 50,
  },
  {
    title: "Apple AirPods Pro",
    description: "Wireless earbuds with active noise cancellation",
    price: 24999,
    count: 100,
  },
  {
    title: "Sony PlayStation 5",
    description: "Next-gen gaming console",
    price: 49999,
    count: 25,
  },
  {
    title: "LG OLED TV 55 inch",
    description: "4K OLED television",
    price: 129999,
    count: 15,
  },
  {
    title: "Dell XPS 13",
    description: "Premium ultrabook laptop",
    price: 149999,
    count: 30,
  },
];

async function sendSingleMessage() {
  console.log("Sending single message to queue...");

  const product = sampleProducts[0];

  try {
    const result = await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(product),
      })
    );

    console.log("Message sent successfully!");
    console.log("MessageId:", result.MessageId);
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

async function sendBatchMessages() {
  console.log(`Sending batch of ${sampleProducts.length} messages to queue...`);

  try {
    const result = await sqsClient.send(
      new SendMessageBatchCommand({
        QueueUrl: QUEUE_URL,
        Entries: sampleProducts.map((product, index) => ({
          Id: `msg-${index}`,
          MessageBody: JSON.stringify(product),
        })),
      })
    );

    console.log("Batch sent successfully!");
    console.log("Successful:", result.Successful?.length || 0);
    console.log("Failed:", result.Failed?.length || 0);

    if (result.Failed && result.Failed.length > 0) {
      console.log("Failed messages:", result.Failed);
    }
  } catch (error) {
    console.error("Error sending batch:", error);
  }
}

async function main() {
  if (QUEUE_URL === "YOUR_QUEUE_URL_HERE") {
    console.error(
      "Please set QUEUE_URL environment variable or update the script"
    );
    console.error(
      "Example: export QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/catalogItemsQueue"
    );
    process.exit(1);
  }

  const mode = process.argv[2] || "batch";

  if (mode === "single") {
    await sendSingleMessage();
  } else if (mode === "batch") {
    await sendBatchMessages();
  } else {
    console.error("Unknown mode. Use 'single' or 'batch'");
    process.exit(1);
  }
}

main().catch(console.error);
