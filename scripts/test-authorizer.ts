import { handler } from "../lib/lambdas/basic-authorizer/handler";
import { APIGatewayTokenAuthorizerEvent } from "aws-lambda";

process.env["kas-s"] = "TEST_PASSWORD";
process.env["test-user"] = "ANOTHER_PASSWORD";

async function testAuthorizer() {
  console.log("Testing Basic Authorizer Lambda\n");
  console.log("=".repeat(50));

  console.log("\n1. Testing with VALID credentials (kas-s:TEST_PASSWORD)");
  try {
    const validToken = Buffer.from("kas-s:TEST_PASSWORD").toString("base64");
    const event1: APIGatewayTokenAuthorizerEvent = {
      type: "TOKEN",
      methodArn:
        "arn:aws:execute-api:us-east-1:123456789012:abcdef/prod/GET/test",
      authorizationToken: `Basic ${validToken}`,
    };
    const result1 = await handler(event1);
    console.log("✓ Result:", JSON.stringify(result1, null, 2));
  } catch (error) {
    console.log("✗ Error:", error);
  }

  console.log("\n2. Testing with INVALID password (kas-s:WRONG_PASSWORD)");
  try {
    const invalidToken = Buffer.from("kas-s:WRONG_PASSWORD").toString("base64");
    const event2: APIGatewayTokenAuthorizerEvent = {
      type: "TOKEN",
      methodArn:
        "arn:aws:execute-api:us-east-1:123456789012:abcdef/prod/GET/test",
      authorizationToken: `Basic ${invalidToken}`,
    };
    const result2 = await handler(event2);
    console.log("✓ Result:", JSON.stringify(result2, null, 2));
  } catch (error) {
    console.log("✗ Error:", error);
  }

  console.log("\n3. Testing with NON-EXISTENT user (unknown:password)");
  try {
    const unknownToken = Buffer.from("unknown:password").toString("base64");
    const event3: APIGatewayTokenAuthorizerEvent = {
      type: "TOKEN",
      methodArn:
        "arn:aws:execute-api:us-east-1:123456789012:abcdef/prod/GET/test",
      authorizationToken: `Basic ${unknownToken}`,
    };
    const result3 = await handler(event3);
    console.log("✓ Result:", JSON.stringify(result3, null, 2));
  } catch (error) {
    console.log("✗ Error:", error);
  }

  console.log("\n4. Testing with NO authorization token");
  try {
    const event4: APIGatewayTokenAuthorizerEvent = {
      type: "TOKEN",
      methodArn:
        "arn:aws:execute-api:us-east-1:123456789012:abcdef/prod/GET/test",
      authorizationToken: "",
    };
    const result4 = await handler(event4);
    console.log("✓ Result:", JSON.stringify(result4, null, 2));
  } catch (error) {
    console.log("✗ Expected Error (401):", (error as Error).message);
  }

  console.log("\n5. Testing with INVALID token format (Bearer token)");
  try {
    const event5: APIGatewayTokenAuthorizerEvent = {
      type: "TOKEN",
      methodArn:
        "arn:aws:execute-api:us-east-1:123456789012:abcdef/prod/GET/test",
      authorizationToken: "Bearer sometoken123",
    };
    const result5 = await handler(event5);
    console.log("✓ Result:", JSON.stringify(result5, null, 2));
  } catch (error) {
    console.log("✗ Expected Error (401):", (error as Error).message);
  }

  console.log("\n" + "=".repeat(50));
  console.log("Testing complete!");
}

testAuthorizer().catch(console.error);
