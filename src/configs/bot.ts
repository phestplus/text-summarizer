// src/configs/bot.ts
import TelegramBot from "node-telegram-bot-api";
import { ENV } from "@configs/env";
import { initBot } from "@bot/handlers";

let bot: TelegramBot | null = null;

/**
 * Create and start bot
 */
export function createBot(): TelegramBot {
  if (!bot) {
    bot = new TelegramBot(ENV.TELEGRAM_TOKEN, { polling: true });

    // Polling error logging
    bot.on("polling_error", (err) => console.error("Polling error:", err));

    // Attach handlers once polling has started
    // Using small timeout ensures polling is active before handling messages
    setTimeout(() => {
      if (!(bot as any).handlersAttached) {
        initBot(bot!);
        (bot as any).handlersAttached = true;
        console.log("✅ Bot handlers attached");
      }
    }, 500);
  }

  return bot;
}

/**
 * Get current bot instance
 */
export function getBot(): TelegramBot | null {
  return bot;
}

/**
 * Stop bot polling and free instance
 */
export async function stopBot(): Promise<void> {
  if (bot) {
    await bot.stopPolling();
    bot = null;
    console.log("✅ Bot stopped and instance freed");
  }
}