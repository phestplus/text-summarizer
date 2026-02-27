import TelegramBot from "node-telegram-bot-api";
import { ENV } from "@configs/env";

let bot: TelegramBot | null = null;

export function createBot(): TelegramBot {
    if (!bot) {
        bot = new TelegramBot(ENV.TELEGRAM_TOKEN, {
            polling: {
                autoStart: true,
                interval: 300,
                params: { timeout: 10 }
            }
        });
    }
    return bot;
}

export function getBot(): TelegramBot | null {
    return bot;
}

export async function stopBot(): Promise<void> {
    if (bot) {
        await bot.stopPolling();
        bot = null; // <- important! frees the instance
    }
}