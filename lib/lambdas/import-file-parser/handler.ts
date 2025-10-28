import { S3Event } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Readable } from "stream";
import csv from "csv-parser";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

const QUEUE_URL = process.env.QUEUE_URL!;

export const handler = async (event: S3Event): Promise<void> => {
  console.log("ImportFileParser event:", JSON.stringify(event, null, 2));

  try {
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

      console.log(`Processing file: ${key} from bucket: ${bucket}`);

      if (!key.endsWith(".csv")) {
        console.log(`Skipping non-CSV file: ${key}`);
        continue;
      }

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await s3Client.send(command);

      if (!response.Body) {
        console.error(`No body in response for ${key}`);
        continue;
      }

      const stream = response.Body as Readable;

      let recordCount = 0;
      let sentCount = 0;

      await new Promise<void>((resolve, reject) => {
        const parser = stream.pipe(csv());
        const promises: Promise<void>[] = [];

        parser
          .on("data", (data) => {
            recordCount++;
            const sendPromise = sqsClient
              .send(
                new SendMessageCommand({
                  QueueUrl: QUEUE_URL,
                  MessageBody: JSON.stringify(data),
                })
              )
              .then(() => {
                sentCount++;
                console.log(`Record ${recordCount} sent to SQS successfully`);
              })
              .catch((error) => {
                console.error(
                  `Error sending record ${recordCount} to SQS:`,
                  error
                );
              });

            promises.push(sendPromise);
          })
          .on("end", async () => {
            await Promise.all(promises);
            console.log(
              `Finished processing ${key}. Total records: ${recordCount}, Sent to SQS: ${sentCount}`
            );
            resolve();
          })
          .on("error", (error) => {
            console.error(`Error parsing CSV ${key}:`, error);
            reject(error);
          });
      });
    }
  } catch (error) {
    console.error("Error processing S3 event:", error);
    throw error;
  }
};
