// storage.ts
import { connection } from "@/queue/redis";

const REDIS_SUBSCRIBERS_KEY = 'subscribers';

/**
 * Add a subscriber (chatId) to Redis.
 * Ensures no duplicates.
 */
export async function addSubscriber(chatId: number) {
  // Using Redis set to avoid duplicates automatically
  await connection.sadd(REDIS_SUBSCRIBERS_KEY, chatId.toString());
}

/**
 * Get all subscribers (chatIds) from Redis.
 */
export async function getSubscribers(): Promise<number[]> {
  const ids = await connection.smembers(REDIS_SUBSCRIBERS_KEY);
  return ids.map(id => parseInt(id, 10));
}

/**
 * Remove a subscriber (optional)
 */
export async function removeSubscriber(chatId: number) {
  await connection.srem(REDIS_SUBSCRIBERS_KEY, chatId.toString());
}

/**
 * Clear all subscribers (admin)
 */
export async function clearSubscribers() {
  await connection.del(REDIS_SUBSCRIBERS_KEY);
}