import { handler } from "../lib/lambdas/import-products-file/handler";
import { APIGatewayProxyEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

jest.mock("@aws-sdk/s3-request-presigner");

const s3Mock = mockClient(S3Client);

describe("importProductsFile Lambda Handler", () => {
  const mockBucketName = "test-bucket";
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    s3Mock.reset();
    process.env = {
      ...originalEnv,
      BUCKET_NAME: mockBucketName,
      AWS_REGION: "us-east-1",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createMockEvent = (
    queryStringParameters: Record<string, string> | null = null
  ): APIGatewayProxyEvent => {
    return {
      queryStringParameters,
      headers: {},
      body: null,
      httpMethod: "GET",
      isBase64Encoded: false,
      path: "/import",
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: "",
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
    };
  };

  describe("Successful scenarios", () => {
    it("should return signed URL for valid CSV file name", async () => {
      const mockSignedUrl =
        "https://test-bucket.s3.amazonaws.com/uploaded/products.csv?signature=xyz";
      const fileName = "products.csv";

      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const event = createMockEvent({ name: fileName });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        signedUrl: mockSignedUrl,
        key: `uploaded/${fileName}`,
      });
      expect(result.headers).toEqual({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.any(PutObjectCommand),
        { expiresIn: 3600 }
      );
    });

    it("should create correct S3 key with uploaded/ prefix", async () => {
      const mockSignedUrl = "https://signed-url.com";
      const fileName = "test-file.csv";

      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const event = createMockEvent({ name: fileName });
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.key).toBe("uploaded/test-file.csv");
    });

    it("should set correct ContentType for CSV files", async () => {
      const mockSignedUrl = "https://signed-url.com";
      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const event = createMockEvent({ name: "data.csv" });
      await handler(event);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.objectContaining({
          input: expect.objectContaining({
            ContentType: "text/csv",
            Key: "uploaded/data.csv",
          }),
        }),
        { expiresIn: 3600 }
      );
    });

    it("should use correct bucket name from environment variable", async () => {
      const mockSignedUrl = "https://signed-url.com";
      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const event = createMockEvent({ name: "file.csv" });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.anything(),
        { expiresIn: 3600 }
      );

      const body = JSON.parse(result.body);
      expect(body.key).toBe("uploaded/file.csv");
    });

    it("should set signed URL expiration to 3600 seconds", async () => {
      const mockSignedUrl = "https://signed-url.com";
      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const event = createMockEvent({ name: "file.csv" });
      await handler(event);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 }
      );
    });
  });

  describe("Validation scenarios", () => {
    it("should return 400 when name parameter is missing", async () => {
      const event = createMockEvent({});
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        message: "Missing required query parameter: name",
      });
      expect(result.headers!["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("should return 400 when query string parameters are null", async () => {
      const event = createMockEvent(null);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        message: "Missing required query parameter: name",
      });
    });

    it("should return 400 for non-CSV file extensions", async () => {
      const event = createMockEvent({ name: "document.pdf" });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        message: "File must be a CSV file",
      });
    });

    it("should return 400 for file without extension", async () => {
      const event = createMockEvent({ name: "noextension" });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        message: "File must be a CSV file",
      });
    });

    it("should return 400 for empty file name", async () => {
      const event = createMockEvent({ name: "" });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        message: "Missing required query parameter: name",
      });
    });

    it("should reject .CSV with wrong case sensitivity", async () => {
      const event = createMockEvent({ name: "file.CSV" });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });
  });

  describe("Error handling scenarios", () => {
    it("should return 500 when getSignedUrl fails", async () => {
      const mockError = new Error("S3 service error");
      (getSignedUrl as jest.Mock).mockRejectedValue(mockError);

      const event = createMockEvent({ name: "products.csv" });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        message: "Internal server error",
      });
      expect(result.headers!["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("should log error details when exception occurs", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const mockError = new Error("Test error");
      (getSignedUrl as jest.Mock).mockRejectedValue(mockError);

      const event = createMockEvent({ name: "file.csv" });
      await handler(event);

      expect(consoleSpy).toHaveBeenCalledWith("Error:", mockError);
      consoleSpy.mockRestore();
    });

    it("should handle AWS SDK errors gracefully", async () => {
      const awsError = {
        name: "AccessDenied",
        message: "Access Denied",
        $metadata: { httpStatusCode: 403 },
      };
      (getSignedUrl as jest.Mock).mockRejectedValue(awsError);

      const event = createMockEvent({ name: "file.csv" });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(result.body).toContain("Internal server error");
    });
  });

  describe("Edge cases", () => {
    it("should handle file names with special characters", async () => {
      const mockSignedUrl = "https://signed-url.com";
      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const fileName = "my-file_v2.0.csv";
      const event = createMockEvent({ name: fileName });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.key).toBe(`uploaded/${fileName}`);
    });

    it("should handle file names with spaces", async () => {
      const mockSignedUrl = "https://signed-url.com";
      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const fileName = "my products.csv";
      const event = createMockEvent({ name: fileName });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.key).toBe(`uploaded/${fileName}`);
    });

    it("should handle very long file names", async () => {
      const mockSignedUrl = "https://signed-url.com";
      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const fileName = "a".repeat(200) + ".csv";
      const event = createMockEvent({ name: fileName });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it("should log the incoming event", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      const mockSignedUrl = "https://signed-url.com";
      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const event = createMockEvent({ name: "file.csv" });
      await handler(event);

      expect(consoleSpy).toHaveBeenCalledWith(
        "ImportProductsFile event:",
        expect.any(String)
      );
      consoleSpy.mockRestore();
    });
  });

  describe("CORS headers", () => {
    it("should include CORS headers in success response", async () => {
      const mockSignedUrl = "https://signed-url.com";
      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const event = createMockEvent({ name: "file.csv" });
      const result = await handler(event);

      expect(result.headers).toHaveProperty("Access-Control-Allow-Origin");
      expect(result.headers!["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("should include CORS headers in error response", async () => {
      const event = createMockEvent({ name: "invalid.txt" });
      const result = await handler(event);

      expect(result.headers).toHaveProperty("Access-Control-Allow-Origin");
      expect(result.headers!["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("should include Content-Type header in all responses", async () => {
      const mockSignedUrl = "https://signed-url.com";
      (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      const event = createMockEvent({ name: "file.csv" });
      const result = await handler(event);

      expect(result.headers).toHaveProperty("Content-Type");
      expect(result.headers!["Content-Type"]).toBe("application/json");
    });
  });
});
