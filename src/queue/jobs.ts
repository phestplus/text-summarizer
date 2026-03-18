// tradeWorker.ts
import { Job, Queue, Worker, connection } from "./redis";
import { generateSignal } from "@/bot/engine";
import { sendMessage } from "@/bot/handlers";
import { normalizeSymbol, formatSignalMarkdown } from "@/integration/ocr";
import { ENV } from "@/configs/env";

// Create the queue
const tradeQueue = new Queue("analyze", { connection });

// Worker to process text-based trades
new Worker(
    "analyze",
    async (job: Job) => {
        const chatId = job.data.chatId;

        if (job.name !== "trade") {
            console.warn("Unknown job type:", job.name);
            return;
        }

        const message: string = job.data.text;
        const capital: string = job.data.capital;
        const parts = message.trim().split(/\s+/);
        const symbol = normalizeSymbol(parts[0]);
        console.log(symbol)
        const timeframe = parts[1]?.toLowerCase();

        if (!symbol || !timeframe) {
            await sendMessage(
                chatId,
                "⚠️ Invalid trade format. Example: EUR/USD 1h"
            );
            return;
        }

        try {
            // Generate signal without API key
            const rawSignal = await generateSignal(
                symbol,
                timeframe,
                capital);

            console.log("Generated Signal:", rawSignal);
            // Save last signal in Redis (admin only)
            if (ENV.ADMIN_CHAT_ID === chatId) {
                await connection.set("lastSignal", JSON.stringify(rawSignal));
            }
            // Send raw signal to the user
            const md = formatSignalMarkdown(rawSignal);
            await sendMessage(chatId, md, { parse_mode: "Markdown" });
        } catch (err: any) {
            console.error("Trade generation error:", err);
            await sendMessage(
                chatId,
                `❌ Unable to analyze trade. ${err.message}`
            );
        }
    },
    { connection }
);

export { tradeQueue };
