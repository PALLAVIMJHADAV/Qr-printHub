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
    static async getPresignedUploadUrl(storageKey, contentType = 'application/pdf', expiresInSeconds = config.PRESIGNED_URL_EXPIRY_SECONDS) {
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
    static async getPresignedDownloadUrl(storageKey, expiresInSeconds = 60) {
        const command = new GetObjectCommand({
            Bucket: config.S3_BUCKET_NAME,
            Key: storageKey,
        });
        return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    }
    /**
     * Hard-deletes a document from object storage
     */
    static async deleteDocument(storageKey) {
        const command = new DeleteObjectCommand({
            Bucket: config.S3_BUCKET_NAME,
            Key: storageKey,
        });
        await s3Client.send(command);
    }
}
