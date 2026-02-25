import { sendMessage } from "@bot/handlers";
import adminServices from "admin/services";
import { runAiAnalysis } from "integration/ai";
import { runImageOCR } from "integration/ocr";
import userServices from "user/services";
import { Job, Queue, Worker, connection } from "./redis";

// Create the queue
const tradeQueue = new Queue("analyze", { connection });

// Create a worker to process jobs
new Worker(
    "analyze",
    async (job: Job) => {
        console.log("job", job);
        try {
            switch (job.name) {
                case "analyze-photo":
                    const ocrResult = await runImageOCR(job.data.filePath);
                    const analysis=await runAiAnalysis(ocrResult)

                    console.log(analysis);
                    await sendMessage(
                        job.data.chatId,
                        `📝 Signal:\n${analysis}`
                    );
                    break;

                case "admin-service":
                    const adminResult = await adminServices.runAdminService(
                        job.data.sevice
                    );
                    if(adminResult){
  await sendMessage(
                        job.data.chatId,
                       adminResult
                    );
                    }
                  
                    break;

                case "user-service":
                    const userResult = await userServices.runUserService(
                        job.data.sevice
                    );
                    if(userResult){
  await sendMessage(
                        job.data.chatId,
                       userResult
                    );
                    }
                  
                    break;
                case "admin-broadcast":
                    const { chatIds, service } = job.data;
                     const adminBroadcastResult = await adminServices.runAdminService(
                        service
                    );
                    if(adminBroadcastResult){
                         for (const chatId of chatIds) {

                    await sendMessage(
                        chatId,
                       adminBroadcastResult
                    );                    }
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

export { tradeQueue };

