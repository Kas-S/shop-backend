import {
  APIGatewayAuthorizerResult,
  APIGatewayTokenAuthorizerEvent,
} from "aws-lambda";

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  console.log("Authorization event:", JSON.stringify(event, null, 2));

  const authorizationToken = event.authorizationToken;

  if (!authorizationToken) {
    console.error("No authorization token provided");
    throw new Error("Unauthorized"); // This returns 401
  }

  try {
    const tokenMatch = authorizationToken.match(/^Basic (.+)$/);

    if (!tokenMatch) {
      console.error("Invalid authorization token format");
      throw new Error("Unauthorized");
    }

    const encodedCredentials = tokenMatch[1];

    const decodedCredentials = Buffer.from(
      encodedCredentials,
      "base64"
    ).toString("utf-8");

    const [username, password] = decodedCredentials.split(":");

    if (!username || !password) {
      console.error("Invalid credentials format");
      throw new Error("Unauthorized");
    }

    console.log(`Attempting to authorize user: ${username}`);

    const storedPassword = process.env[username];

    if (!storedPassword) {
      console.error(`User ${username} not found in environment variables`);
      return generatePolicy(username, "Deny", event.methodArn);
    }

    if (storedPassword !== password) {
      console.error(`Invalid password for user ${username}`);
      return generatePolicy(username, "Deny", event.methodArn);
    }

    console.log(`User ${username} authorized successfully`);
    return generatePolicy(username, "Allow", event.methodArn);
  } catch (error) {
    console.error("Authorization error:", error);
    throw new Error("Unauthorized"); // This returns 401
  }
};

function generatePolicy(
  principalId: string,
  effect: "Allow" | "Deny",
  resource: string
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };
}
