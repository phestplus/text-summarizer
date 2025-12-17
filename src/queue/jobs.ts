import { Queue, Worker, Job, connection } from "./redis";
import { sendMessage } from "@bot/handlers";
import { summarizeText, summarizeTextFile } from "@services/summarizer";
import { storage } from "@bot/storage";

// Create the queue
const summaryQueue = new Queue("summary", { connection });

// Create a worker to process jobs
new Worker(
    "summary",
    async (job: Job) => {
        console.log("job", job);
        try {
            switch (job.name) {
                case "text-summary":
                    const summary = await summarizeText(job.data.text);
                    console.log(summary);
                    await sendMessage(
                        job.data.chatId,
                        `📝 Summary:\n${summary}`
                    );
                    break;

                case "file-summary":
                    const fileSummary = await summarizeTextFile(
                        job.data.filePath
                    );
                    await sendMessage(
                        job.data.chatId,
                        `📄 File Summary:\n${fileSummary}`
                    );
                    break;

                case "broadcast":
                    const { chatIds, text } = job.data;
                    for (const id of chatIds) {
                        await sendMessage(id, `📢 Admin Broadcast:\n${text}`);
                    }
                    break;

                default:
                    console.warn("Unknown job type:", job.name);
            }
        } catch (error) {
            console.log("error queue", error);
            await sendMessage(
  job.data.chatId,
  `⚠️ Our summarization service is temporarily unavailable.  
Please try again in a few minutes. Thank you for your patience.`
);
        }
    },
    { connection }
);

export { summaryQueue };
