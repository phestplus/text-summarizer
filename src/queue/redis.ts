import IORedis from "ioredis";
import { Queue, Worker, Job } from "bullmq"; // no QueueScheduler
import { ENV } from "@configs/env";

 const connection = new IORedis("redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

export { connection, Queue, Worker, Job };