import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../core/config/index.js';

export const s3Client = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
});

export class S3Service {
  /**
   * Generates a short-lived presigned PUT URL for direct client upload
   */
  static async getPresignedUploadUrl(
    storageKey: string,
    contentType: string = 'application/pdf',
    expiresInSeconds: number = config.PRESIGNED_URL_EXPIRY_SECONDS
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: config.S3_BUCKET_NAME,
      Key: storageKey,
      ContentType: contentType,
    });

    return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Generates an ephemeral download URL for print station retrieval (TTL: 60s)
   */
  static async getPresignedDownloadUrl(
    storageKey: string,
    expiresInSeconds: number = 60
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: config.S3_BUCKET_NAME,
      Key: storageKey,
    });

    return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Hard-deletes a document from object storage
   */
  static async deleteDocument(storageKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: config.S3_BUCKET_NAME,
      Key: storageKey,
    });

    await s3Client.send(command);
  }
}
