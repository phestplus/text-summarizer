import { ENV } from '@configs/env';
import { tradeQueue } from '@queue/jobs';
import TelegramBot from 'node-telegram-bot-api';
import { saveStorage, storage } from './storage';

let bot: TelegramBot;

export function initBot(token: string) {
  bot = new TelegramBot(token, { polling: true });

  console.log('✅ Bot initialized');

  /* -------------------- START -------------------- */

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    registerSubscriber(chatId);

    await bot.sendMessage(
      chatId,
      `👋 *Welcome to TradeSignal Bot*

Send a trading chart screenshot with visible indicators.

📸 *How it works*
• Send screenshot  
• OCR extracts indicator values  
• Signal generated automatically  

⚠️ Signals are algorithmic insights, not financial advice.`,
      { parse_mode: 'Markdown' },
    );
  });

  /* -------------------- ADMIN BROADCAST -------------------- */

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.text?.startsWith('/broadcast')) {
      if (chatId !== ENV.ADMIN_CHAT_ID) {
        await bot.sendMessage(chatId, 'Unauthorized: admin only.');
        return;
      }

      const message = msg.text.replace('/broadcast', '').trim();

      if (!message) {
        await bot.sendMessage(chatId, 'Usage: /broadcast <message>');
        return;
      }

      await tradeQueue.add('broadcast', {
        chatIds: storage.subscribers,
        text: message,
      });

      await bot.sendMessage(chatId, `✅ Broadcast queued to ${storage.subscribers.length} users.`);
    }
  });

  /* -------------------- PHOTO HANDLER -------------------- */

  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;

    try {
      registerSubscriber(chatId);
      const fileId = msg.photo![msg.photo!.length - 1].file_id;
      const file = await bot.getFile(fileId);
      tradeQueue.add('analyze-photo', { chatId, filePath: file.file_path });
      await sendMessage(chatId, '📊 Screenshot received. Analysing...');
    } catch (err) {
      await bot.sendMessage(chatId, '❌ Error processing screenshot.');
    }
  });

  /* -------------------- DEFAULT TEXT RESPONSE -------------------- */

  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.text?.startsWith('/')) return;

    registerSubscriber(chatId);

    await bot.sendMessage(chatId, '📩 Send a trading chart screenshot for analysis.');
  });
}

/* -------------------- HELPERS -------------------- */

function registerSubscriber(chatId: number) {
  if (!storage.subscribers.includes(chatId)) {
    storage.subscribers.push(chatId);
    saveStorage(storage);
    console.log(`✅ New subscriber: ${chatId}`);
  }
}

export async function sendMessage(chatId: number, text: string, options?: any) {
  if (!bot) throw new Error('Bot not initialized');

  try {
    await bot.sendMessage(chatId, text, options);
  } catch (err: any) {
    console.error(`Failed to send message to ${chatId}:`, err.message);
  }
}
