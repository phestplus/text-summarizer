import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  TELEGRAM_TOKEN: z.string().nonempty(),
  ADMIN_CHAT_ID: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => !isNaN(val)),
  OPENAI_API_KEY: z.string().nonempty(),
  OPEN_ROUTER_API_KEY: z.string().nonempty(),
  TWELVE_DATA_API_KEY: z.string().nonempty(),
  CLOUDINARY_API_KEY: z.string().nonempty(),
  CLOUDINARY_API_SECRET: z.string().nonempty(),
  CLOUDINARY_CLOUD_NAME: z.string().nonempty(),
  CLOUDINARY_URL: z.string().nonempty(),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PORT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 6379)),
});

export const ENV = envSchema.parse(process.env);
