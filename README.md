# Shop Backend - AWS CDK E-Commerce Platform

This is a serverless e-commerce backend built with AWS CDK and TypeScript.

## Architecture

The application consists of four main stacks:

1. **ProductServiceStack** - Product catalog with DynamoDB, API Gateway, and Lambda functions
2. **ImportServiceStack** - CSV import service with S3, SQS integration
3. **AuthorizationServiceStack** - Basic Authentication service for API Gateway
4. **ShopBackendStack** - Base infrastructure stack

### Key Features

- 📦 **Product Management**: CRUD operations for products with stock management
- 📥 **CSV Import**: Upload CSV files to bulk import products
- 📨 **Batch Processing**: SQS-based batch processing (5 products at a time)
- 📧 **Email Notifications**: SNS notifications when products are created
- 🔒 **Secure Uploads**: Pre-signed S3 URLs for file uploads
- 🔐 **Basic Authentication**: Lambda authorizer for API Gateway endpoints
- 📊 **NoSQL Database**: DynamoDB for products and stock tables
- 🚀 **Serverless**: Lambda functions with Node.js 20.x runtime

## Quick Start

### Prerequisites

- Node.js 20.x or later
- AWS CLI configured with credentials
- AWS CDK CLI installed (`npm install -g aws-cdk`)

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

### Deploy

```bash
# Deploy all stacks
cdk deploy --all

# Or deploy individually
cdk deploy AuthorizationServiceStack
cdk deploy ProductServiceStack
cdk deploy ImportServiceStack
```

## Authentication

The Authorization Service provides Basic Authentication for protected endpoints.

**Default Test Credentials:**

- Username: `kas-s` (GitHub account name)
- Password: `TEST_PASSWORD`

**Usage Example:**

```bash
# Create base64 token
echo -n 'kas-s:TEST_PASSWORD' | base64
# Result: a2FzLXM6VEVTVF9QQVNTV09SRA==

# Use in API request
curl -H "Authorization: Basic a2FzLXM6VEVTVF9QQVNTV09SRA==" \
  https://YOUR_API_URL/protected-endpoint
```

See [AUTHORIZATION-SERVICE.md](./docs/AUTHORIZATION-SERVICE.md) for detailed documentation.

## Testing with Sample Data

We provide several sample CSV files for testing:

| File                          | Products | Category          | Use Case                  |
| ----------------------------- | -------- | ----------------- | ------------------------- |
| `sample-products.csv`         | 10       | Tech/Electronics  | Standard testing          |
| `sample-products-small.csv`   | 5        | Mobile Devices    | Quick test (1 batch)      |
| `sample-products-office.csv`  | 15       | Office Supplies   | Larger import (3 batches) |
| `sample-products-fitness.csv` | 15       | Fitness Equipment | Category variety testing  |

### Upload a Sample CSV

1. Get a signed URL:

```bash
curl "https://YOUR_IMPORT_API_URL/import?name=sample-products.csv"
```

2. Upload the file:

```bash
curl -X PUT \
  -H "Content-Type: text/csv" \
  --data-binary @sample-products.csv \
  "SIGNED_URL_FROM_STEP_1"
```

3. Check your email for product creation notifications!

See [SAMPLE-CSV-USAGE.md](./docs/SAMPLE-CSV-USAGE.md) for detailed usage instructions.

## API Endpoints

### Product Service API

- `GET /products` - List all products with stock information
- `GET /products/{productId}` - Get a specific product by ID
- `POST /products` - Create a new product
- `GET /swagger.json` - OpenAPI specification

### Import Service API

- `GET /import?name={filename}` - Get a pre-signed S3 URL for CSV upload

## Project Structure

```
├── bin/
│   └── shop-backend.ts          # CDK app entry point
├── lib/
│   ├── product-service-stack.ts  # Product service infrastructure
│   ├── import-service-stack.ts   # Import service infrastructure
│   └── lambdas/                  # Lambda function code
│       ├── get-products-list/
│       ├── get-products-by-id/
│       ├── create-product/
│       ├── import-products-file/
│       ├── import-file-parser/
│       └── catalog-batch-process/
├── test/                         # Unit tests
├── docs/                         # Documentation
├── sample-*.csv                  # Sample CSV files for testing
└── scripts/                      # Utility scripts
```

## Environment Variables

### ProductServiceStack Lambdas

- `PRODUCTS_TABLE_NAME` - DynamoDB products table name
- `STOCK_TABLE_NAME` - DynamoDB stock table name
- `SNS_TOPIC_ARN` - SNS topic for product creation notifications

### ImportServiceStack Lambdas

- `BUCKET_NAME` - S3 bucket for CSV uploads
- `QUEUE_URL` - SQS queue URL for catalog items

## Monitoring

### CloudWatch Logs

- Product Service: `/aws/lambda/ProductServiceStack-*`
- Import Service: `/aws/lambda/ImportServiceStack-*`

### Key Metrics to Watch

- Lambda invocations and errors
- SQS queue messages (sent/received/deleted)
- DynamoDB read/write capacity
- SNS notifications delivered

## Development

### Running Tests

```bash
npm test
```

### Watch Mode

```bash
npm run watch
```

### Send Test Messages to SQS

```bash
export QUEUE_URL=$(aws cloudformation describe-stacks \
  --stack-name ProductServiceStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CatalogItemsQueueUrl`].OutputValue' \
  --output text)

npm run send-to-queue batch
```

## Documentation

- [Sample CSV Usage Guide](./docs/SAMPLE-CSV-USAGE.md) - Detailed guide for testing with CSV files
- [Catalog Batch Process](./docs/CATALOG-BATCH-PROCESS.md) - SQS batch processing documentation
- [Test Documentation](./test/README-TESTS.md) - Unit testing guide

## Configuration

### Update Email for SNS Notifications

Edit `lib/product-service-stack.ts`:

```typescript
createProductTopic.addSubscription(
  new sns_subscriptions.EmailSubscription("your-email@example.com")
);
```

Then redeploy:

```bash
cdk deploy ProductServiceStack
```

Don't forget to confirm the subscription via email!

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template
- `npm run send-to-queue` - Send test messages to SQS queue

## Cleanup

To avoid incurring charges, destroy the stacks when done:

```bash
cdk destroy --all
```

Note: DynamoDB tables have `RETAIN` policy and won't be deleted automatically.

## License

This project is licensed under the MIT License.
