import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:3000'),

  API_BASE_URL: z.string().default('http://localhost:3000/api/v1'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().default('postgresql://qrprint_user:qrprint_secure_pass@localhost:5432/qrprint_db'),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().default(0),

  JWT_ACCESS_SECRET: z.string().min(16).default('development-jwt-access-secret-32chars-long'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16).default('development-jwt-refresh-secret-32chars-long'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET_NAME: z.string().default('qrprint-documents'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  PRESIGNED_URL_EXPIRY_SECONDS: z.coerce.number().default(300),

  MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  DOCUMENT_RETENTION_HOURS: z.coerce.number().default(2),

  PAYMENT_GATEWAY_PROVIDER: z.string().default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('mock_webhook_secret_for_hmac'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', JSON.stringify(parsedEnv.error.format(), null, 2));
  throw new Error('Environment configuration validation failed');
}

export const config = parsedEnv.data;
export type Config = z.infer<typeof envSchema>;
