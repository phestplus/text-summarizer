import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import fetch from "node-fetch";
import { summaryQueue } from "@queue/jobs";
import { storage, saveStorage } from "./storage";
import { ENV } from "@configs/env";

let bot: TelegramBot;

export function initBot(token: string) {
    bot = new TelegramBot(token, { polling: true });

    bot.on("message", async msg => {
        const chatId = msg.chat.id;
        console.log(chatId, msg);
        // Admin broadcast
        // Admin broadcast
        if (msg.text?.startsWith("/broadcast")) {
            if (chatId !== ENV.ADMIN_CHAT_ID) {
                await bot.sendMessage(chatId, "Unauthorized: admin only.");
                return;
            }
            const message = msg.text.replace("/broadcast", "").trim();
            if (!message) return;
            await summaryQueue.add("broadcast", {
                chatIds: storage.subscribers,
                text: message
            });
            await bot.sendMessage(
                chatId,
                `Broadcast queued to ${storage.subscribers.length} users.`
            );
            return;
        }

        // Summarize text
        if (msg.text?.startsWith("/summarize ")) {
            const text = msg.text.replace("/summarize ", "").trim();
            if (!text) return;
            await summaryQueue.add("text-summary", { chatId, text });
            await bot.sendMessage(
                chatId,
                "🕒 Your text is being summarized..."
            );
            return;
        }

        // Summarize document file
        if (msg.document) {
            const downloadsDir = "./downloads";
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

            const filePath = `${downloadsDir}/${msg.document.file_name}`;
            const fileLink = await bot.getFileLink(msg.document.file_id);
            const res = await fetch(fileLink);
            const buffer = Buffer.from(await res.arrayBuffer());
            fs.writeFileSync(filePath, buffer);

            await summaryQueue.add("file-summary", { chatId, filePath });
            await bot.sendMessage(
                chatId,
                "🕒 Your file is being summarized..."
            );
            return;
        }

        // Register subscriber
        if (!storage.subscribers.includes(chatId)) {
            storage.subscribers.push(chatId);
            saveStorage(storage);
        }

        await bot.sendMessage(
            chatId,
            "Message received. Use /summarize <text> or send a text file."
        );
    });
}

export async function sendMessage(chatId: number, text: string) {
    if (!bot) throw new Error("Bot not initialized");
    try {
        await bot.sendMessage(chatId, text);
    } catch (err: any) {
        console.error(`Failed to send message to ${chatId}:`, err.message);
    }
}
