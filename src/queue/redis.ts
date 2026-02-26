import { ENV } from '@configs/env';
import { Job, Queue, Worker } from 'bullmq'; // no QueueScheduler
import IORedis from 'ioredis';

const connection = new IORedis(ENV.REDIS_URL, {
  maxRetriesPerRequest: null,
});
if (connection) {
  connection.on('connect', () => {
    console.log('✅ Redis connected');
  });

  connection.on('error', (err) => {
    console.error('❌ Redis error:', err);
  });
}

export { connection, Job, Queue, Worker };
