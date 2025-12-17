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
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  REDIS_PORT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 6379))
});

export const ENV = envSchema.parse(process.env);