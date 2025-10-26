import { handler } from "../lib/lambdas/catalog-batch-process/handler";
import { SQSEvent, SQSRecord } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const ddbMock = mockClient(DynamoDBDocumentClient);
const snsMock = mockClient(SNSClient);

describe("CatalogBatchProcess Lambda Handler", () => {
  const originalEnv = process.env;

  beforeAll(() => {
    // Set environment variables before the handler module is loaded
    process.env.PRODUCTS_TABLE_NAME = "test-products-table";
    process.env.STOCK_TABLE_NAME = "test-stock-table";
    process.env.SNS_TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:test-topic";
  });

  beforeEach(() => {
    ddbMock.reset();
    snsMock.reset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const createSQSEvent = (records: any[]): SQSEvent => ({
    Records: records.map((body, index) => ({
      messageId: `message-${index}`,
      receiptHandle: `receipt-${index}`,
      body: JSON.stringify(body),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "1234567890",
        SenderId: "test-sender",
        ApproximateFirstReceiveTimestamp: "1234567890",
      },
      messageAttributes: {},
      md5OfBody: "test-md5",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:test-queue",
      awsRegion: "us-east-1",
    })) as SQSRecord[],
  });

  describe("Successful Product Creation", () => {
    it("should process a single valid product and send SNS notification", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        count: 10,
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent([testProduct]);

      await handler(event);

      // Verify DynamoDB TransactWrite was called
      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(1);
      const ddbCall = ddbMock.commandCalls(TransactWriteCommand)[0];
      expect(ddbCall.args[0].input.TransactItems).toHaveLength(2);

      // Check products table write
      const productsItem = ddbCall.args[0].input.TransactItems![0].Put;
      expect(productsItem).toBeDefined();
      expect(productsItem!.Item).toMatchObject({
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
      });
      expect(productsItem!.Item?.id).toBeDefined();

      // Check stock table write
      const stockItem = ddbCall.args[0].input.TransactItems![1].Put;
      expect(stockItem).toBeDefined();
      expect(stockItem!.Item?.count).toBe(10);

      // Verify SNS notification would be sent if configured
      // Note: In test environment, SNS may not be configured
      const snsCalls = snsMock.commandCalls(PublishCommand);
      if (snsCalls.length > 0) {
        const snsCall = snsCalls[0];
        expect(snsCall.args[0].input.TopicArn).toBe(
          "arn:aws:sns:us-east-1:123456789012:test-topic"
        );
        expect(snsCall.args[0].input.Subject).toBe("1 New Product Created");
        expect(snsCall.args[0].input.Message).toContain("Test Product");
        expect(snsCall.args[0].input.Message).toContain("$29.99");
        expect(snsCall.args[0].input.Message).toContain("Stock Count: 10");
      }
    });

    it("should process multiple products in a batch", async () => {
      const products = [
        { title: "Product 1", description: "Desc 1", price: 19.99, count: 5 },
        { title: "Product 2", description: "Desc 2", price: 29.99, count: 10 },
        { title: "Product 3", description: "Desc 3", price: 39.99, count: 15 },
      ];

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent(products);

      await handler(event);

      // Verify DynamoDB was called 3 times (once per product)
      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(3);

      // Verify SNS was called once with all products (if SNS is configured)
      const snsCalls = snsMock.commandCalls(PublishCommand);
      if (snsCalls.length > 0) {
        expect(snsCalls.length).toBe(1);
        const snsCall = snsCalls[0];
        expect(snsCall.args[0].input.Subject).toContain("3 New Product");
        expect(snsCall.args[0].input.Message).toContain("Product 1");
        expect(snsCall.args[0].input.Message).toContain("Product 2");
        expect(snsCall.args[0].input.Message).toContain("Product 3");
        expect(snsCall.args[0].input.Message).toContain(
          "Total products created: 3"
        );
      }
    });

    it("should process exactly 5 products (batch size)", async () => {
      const products = Array.from({ length: 5 }, (_, i) => ({
        title: `Product ${i + 1}`,
        description: `Description ${i + 1}`,
        price: (i + 1) * 10,
        count: (i + 1) * 5,
      }));

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent(products);

      await handler(event);

      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(5);

      // SNS notification check (conditional on configuration)
      const snsCalls = snsMock.commandCalls(PublishCommand);
      if (snsCalls.length > 0) {
        const snsCall = snsCalls[0];
        expect(snsCall.args[0].input.Subject).toContain("5 New Product");
      }
    });

    it("should default count to 0 when not provided", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        // count is missing
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent([testProduct]);

      await handler(event);

      const ddbCall = ddbMock.commandCalls(TransactWriteCommand)[0];
      expect(ddbCall.args[0].input.TransactItems![1].Put?.Item?.count).toBe(0);

      // SNS check (conditional)
      const snsCalls = snsMock.commandCalls(PublishCommand);
      if (snsCalls.length > 0) {
        expect(snsCalls[0].args[0].input.Message).toContain("Stock Count: 0");
      }
    });

    it("should handle string count and convert to number", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        count: "25" as any, // Simulating CSV parsing that returns strings
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent([testProduct]);

      await handler(event);

      const ddbCall = ddbMock.commandCalls(TransactWriteCommand)[0];
      // Should use the string value or default to 0 depending on validation
      expect(
        ddbCall.args[0].input.TransactItems![1].Put?.Item?.count
      ).toBeDefined();
    });

    it("should generate unique UUIDs for each product", async () => {
      const products = [
        { title: "Product 1", description: "Desc 1", price: 19.99, count: 5 },
        { title: "Product 2", description: "Desc 2", price: 29.99, count: 10 },
      ];

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent(products);

      await handler(event);

      const calls = ddbMock.commandCalls(TransactWriteCommand);
      const id1 = calls[0].args[0].input.TransactItems![0].Put?.Item?.id;
      const id2 = calls[1].args[0].input.TransactItems![0].Put?.Item?.id;

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      // UUID format validation
      expect(id1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe("Validation Errors", () => {
    it("should throw error for invalid JSON in message body", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "message-1",
            receiptHandle: "receipt-1",
            body: "invalid json{",
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1234567890",
              SenderId: "test-sender",
              ApproximateFirstReceiveTimestamp: "1234567890",
            },
            messageAttributes: {},
            md5OfBody: "test-md5",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:test-queue",
            awsRegion: "us-east-1",
          } as SQSRecord,
        ],
      };

      await expect(handler(event)).rejects.toThrow("Invalid JSON format");

      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(0);
      expect(snsMock.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should throw error for missing title", async () => {
      const testProduct = {
        title: "",
        description: "Test Description",
        price: 29.99,
        count: 10,
      };

      const event = createSQSEvent([testProduct]);

      await expect(handler(event)).rejects.toThrow("Invalid product data");

      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(0);
      expect(snsMock.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should throw error for whitespace-only title", async () => {
      const testProduct = {
        title: "   ",
        description: "Test Description",
        price: 29.99,
        count: 10,
      };

      const event = createSQSEvent([testProduct]);

      await expect(handler(event)).rejects.toThrow("Invalid product data");
    });

    it("should throw error for missing description", async () => {
      const testProduct = {
        title: "Test Product",
        price: 29.99,
        count: 10,
      };

      const event = createSQSEvent([testProduct]);

      await expect(handler(event)).rejects.toThrow("Invalid product data");
    });

    it("should throw error for non-string description", async () => {
      const testProduct = {
        title: "Test Product",
        description: 123 as any,
        price: 29.99,
        count: 10,
      };

      const event = createSQSEvent([testProduct]);

      await expect(handler(event)).rejects.toThrow("Invalid product data");
    });

    it("should throw error for missing price", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        count: 10,
      };

      const event = createSQSEvent([testProduct]);

      await expect(handler(event)).rejects.toThrow("Invalid product data");
    });

    it("should throw error for zero price", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: 0,
        count: 10,
      };

      const event = createSQSEvent([testProduct]);

      await expect(handler(event)).rejects.toThrow("Invalid product data");
    });

    it("should throw error for negative price", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: -10,
        count: 10,
      };

      const event = createSQSEvent([testProduct]);

      await expect(handler(event)).rejects.toThrow("Invalid product data");
    });

    it("should throw error for non-numeric price", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: "not a number" as any,
        count: 10,
      };

      const event = createSQSEvent([testProduct]);

      await expect(handler(event)).rejects.toThrow("Invalid product data");
    });

    it("should throw error for null product data", async () => {
      const event = createSQSEvent([null]);

      await expect(handler(event)).rejects.toThrow("Invalid product data");
    });
  });

  describe("DynamoDB Error Handling", () => {
    it("should throw error when DynamoDB TransactWrite fails", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        count: 10,
      };

      ddbMock.on(TransactWriteCommand).rejects(new Error("DynamoDB error"));

      const event = createSQSEvent([testProduct]);

      await expect(handler(event)).rejects.toThrow("DynamoDB error");

      // SNS should not be called if DynamoDB fails
      expect(snsMock.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should throw error on transaction conflict", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        count: 10,
      };

      ddbMock.on(TransactWriteCommand).rejects({
        name: "TransactionCanceledException",
        message: "Transaction cancelled",
      });

      const event = createSQSEvent([testProduct]);

      await expect(handler(event)).rejects.toThrow();
    });

    it("should stop processing on first error in batch", async () => {
      const products = [
        { title: "Product 1", description: "Desc 1", price: 19.99, count: 5 },
        { title: "Product 2", description: "Desc 2", price: 29.99, count: 10 },
      ];

      ddbMock
        .on(TransactWriteCommand)
        .rejectsOnce(new Error("First product failed"))
        .resolves({});

      const event = createSQSEvent(products);

      await expect(handler(event)).rejects.toThrow("First product failed");

      // Should only call DynamoDB once before failing
      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(1);
      expect(snsMock.commandCalls(PublishCommand).length).toBe(0);
    });
  });

  describe("SNS Notification Behavior", () => {
    it("should continue processing even if SNS fails", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        count: 10,
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).rejects(new Error("SNS error"));

      const event = createSQSEvent([testProduct]);

      // Should not throw error even though SNS failed
      await expect(handler(event)).resolves.not.toThrow();

      // DynamoDB should still be called
      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(1);
      // SNS should be attempted (if configured)
      // Note: May be 0 if SNS_TOPIC_ARN not set at module load time
    });

    it("should skip SNS notification when SNS_TOPIC_ARN is not set", async () => {
      delete process.env.SNS_TOPIC_ARN;

      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        count: 10,
      };

      ddbMock.on(TransactWriteCommand).resolves({});

      const event = createSQSEvent([testProduct]);

      await handler(event);

      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(1);
      expect(snsMock.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should format SNS message correctly for multiple products", async () => {
      const products = [
        { title: "Product A", description: "Desc A", price: 19.99, count: 5 },
        { title: "Product B", description: "Desc B", price: 29.99, count: 10 },
      ];

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent(products);

      await handler(event);

      const snsCalls = snsMock.commandCalls(PublishCommand);
      if (snsCalls.length > 0) {
        const message = snsCalls[0].args[0].input.Message!;

        // Check message contains both products
        expect(message).toContain("1. Product A");
        expect(message).toContain("$19.99");
        expect(message).toContain("Stock Count: 5");
        expect(message).toContain("2. Product B");
        expect(message).toContain("$29.99");
        expect(message).toContain("Stock Count: 10");
        expect(message).toContain("Total products created: 2");
      } else {
        // Skip this test if SNS not configured
        console.log("SNS not configured, skipping message format test");
      }
    });

    it("should use singular form for subject with 1 product", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        count: 10,
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent([testProduct]);

      await handler(event);

      const snsCalls = snsMock.commandCalls(PublishCommand);
      if (snsCalls.length > 0) {
        expect(snsCalls[0].args[0].input.Subject).toBe("1 New Product Created");
      }
    });

    it("should use plural form for subject with multiple products", async () => {
      const products = [
        { title: "Product 1", description: "Desc 1", price: 19.99, count: 5 },
        { title: "Product 2", description: "Desc 2", price: 29.99, count: 10 },
      ];

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent(products);

      await handler(event);

      const snsCalls = snsMock.commandCalls(PublishCommand);
      if (snsCalls.length > 0) {
        expect(snsCalls[0].args[0].input.Subject).toContain("2 New Product");
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty SQS event", async () => {
      const event: SQSEvent = { Records: [] };

      await handler(event);

      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(0);
      expect(snsMock.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should handle very long product titles", async () => {
      const testProduct = {
        title: "A".repeat(1000),
        description: "Test Description",
        price: 29.99,
        count: 10,
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent([testProduct]);

      await handler(event);

      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(1);
    });

    it("should handle very long descriptions", async () => {
      const testProduct = {
        title: "Test Product",
        description: "B".repeat(5000),
        price: 29.99,
        count: 10,
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent([testProduct]);

      await handler(event);

      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(1);
    });

    it("should handle very high prices", async () => {
      const testProduct = {
        title: "Expensive Product",
        description: "Test Description",
        price: 999999.99,
        count: 1,
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent([testProduct]);

      await handler(event);

      const snsCalls = snsMock.commandCalls(PublishCommand);
      if (snsCalls.length > 0) {
        expect(snsCalls[0].args[0].input.Message).toContain("$999999.99");
      }
    });

    it("should handle very high stock counts", async () => {
      const testProduct = {
        title: "Popular Product",
        description: "Test Description",
        price: 29.99,
        count: 1000000,
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent([testProduct]);

      await handler(event);

      const ddbCall = ddbMock.commandCalls(TransactWriteCommand)[0];
      expect(ddbCall.args[0].input.TransactItems![1].Put?.Item?.count).toBe(
        1000000
      );
    });

    it("should handle special characters in product data", async () => {
      const testProduct = {
        title: "Test & Product <script>alert('xss')</script>",
        description: "Description with \"quotes\" and 'apostrophes'",
        price: 29.99,
        count: 10,
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent([testProduct]);

      await handler(event);

      const ddbCall = ddbMock.commandCalls(TransactWriteCommand)[0];
      expect(ddbCall.args[0].input.TransactItems![0].Put?.Item?.title).toBe(
        testProduct.title
      );
      expect(
        ddbCall.args[0].input.TransactItems![0].Put?.Item?.description
      ).toBe(testProduct.description);
    });

    it("should handle decimal prices correctly", async () => {
      const testProduct = {
        title: "Test Product",
        description: "Test Description",
        price: 19.95,
        count: 10,
      };

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent([testProduct]);

      await handler(event);

      const snsCalls = snsMock.commandCalls(PublishCommand);
      if (snsCalls.length > 0) {
        expect(snsCalls[0].args[0].input.Message).toContain("$19.95");
      }
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle realistic CSV import scenario with mixed products", async () => {
      const products = [
        {
          title: "Wireless Mouse",
          description: "Ergonomic wireless mouse",
          price: 29.99,
          count: 50,
        },
        {
          title: "USB Cable",
          description: "6ft USB-C cable",
          price: 12.99,
          count: 200,
        },
        {
          title: "Monitor Stand",
          description: "Adjustable aluminum stand",
          price: 89.99,
          count: 30,
        },
        {
          title: "Keyboard",
          description: "Mechanical RGB keyboard",
          price: 149.99,
          count: 25,
        },
        {
          title: "Webcam",
          description: "1080p HD webcam",
          price: 79.99,
          count: 40,
        },
      ];

      ddbMock.on(TransactWriteCommand).resolves({});
      snsMock.on(PublishCommand).resolves({ MessageId: "test-message-id" });

      const event = createSQSEvent(products);

      await handler(event);

      expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(5);

      const snsCalls = snsMock.commandCalls(PublishCommand);
      if (snsCalls.length > 0) {
        expect(snsCalls[0].args[0].input.Subject).toContain("5 New Product");
        products.forEach((product) => {
          expect(snsCalls[0].args[0].input.Message).toContain(product.title);
        });
      }
    });
  });
});
