import { ENV } from "@/configs/env";
import { tradeQueue } from "@/queue/jobs";
import { connection } from "@/queue/redis";
import TelegramBot from "node-telegram-bot-api";
import {getBot} from "@configs/bot";
import { saveStorage, storage } from "./storage";

/* ========================= INIT ========================= */

export function initBot(bot: TelegramBot) {
    /* ========================= SET COMMANDS ========================= */

    // Define your commands
    const commands = [
        {
            command: "start",
            description: "Start the bot and register yourself"
        },
        { command: "signal", description: "Generate a trade signal" },
        { command: "help", description: "Show instructions" }
    ];

    // Register commands with Telegram
    bot.setMyCommands(commands).then(() =>
        console.log("✅ Commands registered with Telegram")
    );

    bot.setMyCommands(
        [
            {
                command: "broadcast",
                description: "Admin only: broadcast message"
            },
            {
                command: "start",
                description: "Start the bot and register yourself"
            },
            { command: "signal", description: "Generate a trade signal" },
            { command: "clear", description: "Clear bot cache" },
            { command: "help", description: "Show instructions" }
        ],
        {
            scope: { type: "chat", chat_id: ENV.ADMIN_CHAT_ID }
        }
    );
    /* ========================= START ========================= */

    bot.onText(/^\/start(?:@\w+)?$/, async msg => {
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
            { parse_mode: "Markdown" }
        );
    });

    /* ========================= BROADCAST ========================= */

    bot.onText(/^\/broadcast(?:@\w+)? (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (chatId !== ENV.ADMIN_CHAT_ID) {
            await bot.sendMessage(chatId, "Unauthorized: admin only.");
            return;
        }

        const message = match?.[1]?.trim();

        if (!message) {
            await bot.sendMessage(chatId, "Usage: /broadcast <message>");
            return;
        }

        await tradeQueue.add("broadcast", {
            chatIds: storage.subscribers,
            text: message
        });

        await bot.sendMessage(
            chatId,
            `✅ Broadcast queued to ${storage.subscribers.length} users.`
        );
    });

    /* ========================= CLEAR ========================= */
    bot.onText(/\/clear/, async msg => {
        const chatId = msg.chat.id;

        // Restrict to admin only
        if (chatId !== ENV.ADMIN_CHAT_ID) {
            await bot.sendMessage(chatId, "❌ Unauthorized: admin only.");
            return;
        }

        try {
            // Option 1: Clear Redis keys used by your bot storage
            const keys = await connection.keys("*"); // be careful in prod
            if (keys.length > 0) {
                await connection.del(keys);
            }

            // Option 2: Clear specific queues
            // await tradeQueue.obliterate({ force: true }); // clears all jobs

            await bot.sendMessage(
                chatId,
                "✅ Redis cache and trade queue cleared."
            );
        } catch (err) {
            console.error("Error clearing Redis:", err);
            await bot.sendMessage(chatId, "❌ Failed to clear Redis cache.");
        }
    });
    /* ========================= SIGNAL ========================= */
    bot.on("callback_query", async query => {
        const chatId = query.message!.chat.id;
        const data = query.data!;

        if (data.startsWith("pair_")) {
            const pair = data.replace("pair_", "");
            const timeframes = [
                "1m",
                "5m",
                "15m",
                "30m",
                "1h",
                "2h",
                "4h",
                "6h",
                "12h",
                "1d",
                "1w"
            ];

            // Convert to Telegram inline keyboard rows (max 2–3 per row)
            const keyboard: any[][] = [];
            for (let i = 0; i < timeframes.length; i += 3) {
                const row = timeframes.slice(i, i + 3).map(tf => ({
                    text: tf,
                    callback_data: `tf_${pair}_${tf}`
                }));
                keyboard.push(row);
            }
            await bot.sendMessage(chatId, `⏱ Select timeframe for ${pair}`, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
        if (data.startsWith("tf_")) {
            const [, pair, timeframe] = data.split("_");

            await tradeQueue.add("trade", {
                chatId,
                text: `${pair} ${timeframe}`
            });

            await bot.sendMessage(chatId, `✅ Analysing ${pair} ${timeframe}`);
        }

        await bot.answerCallbackQuery(query.id);
    });

    bot.onText(/^\/signal(?:@\w+)?$/, async msg => {
        const chatId = msg.chat.id;
        const tradingPairs = [
            // Forex
            "EUR/USD",
            "GBP/USD",
            "USD/JPY",
            "AUD/USD",
            "USD/CAD",
            "NZD/USD",
            "USD/CHF",
            "USD/THB",
            // Crypto
            "BTC/USDT",
            "ETH/USDT",
            "BNB/USDT",
            "SOL/USDT",
            "ADA/USDT",
            // Commodities
            "XAU/USD",
            "XAG/USD",
            "OIL/USD",
            // Indices
            "SPX500",
            "DJI30",
            "NASDAQ100"
        ];
        const pairKeyboard: any[][] = [];
        const buttonsPerRow = 2; // change to 3 if you want more compact rows

        for (let i = 0; i < tradingPairs.length; i += buttonsPerRow) {
            const row = tradingPairs.slice(i, i + buttonsPerRow).map(pair => ({
                text: pair,
                callback_data: `pair_${pair.replace("/", "")}` // remove slash for callback
            }));
            pairKeyboard.push(row);
        }
        await bot.sendMessage(chatId, "📊 Select trading pair", {
            reply_markup: {
                inline_keyboard: pairKeyboard
            }
        });
    });

    /* ========================= TRADE ========================= */

    bot.onText(/^\/signal(?:@\w+)? (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;

        const message = match?.[1]?.trim();

        if (!message) {
            await bot.sendMessage(chatId, "Usage: /trade EUR/USD 1H");
            return;
        }

        await tradeQueue.add("trade", {
            chatId,
            text: message
        });

        await bot.sendMessage(chatId, `✅ Trade is being analysed`);
    });

    /* ========================= PHOTO ========================= */

    bot.on("photo", async msg => {
        const chatId = msg.chat.id;

        try {
            registerSubscriber(chatId);

            const fileId = msg.photo![msg.photo!.length - 1].file_id;
            const file = await bot.getFile(fileId);

            // Construct full URL so worker doesn't depend on bot context
            const fileUrl = `https://api.telegram.org/file/bot${ENV.TELEGRAM_TOKEN}/${file.file_path}`;

            await tradeQueue.add("analyze-photo", {
                chatId,
                fileUrl
            });

            await sendMessage(chatId, "📊 Screenshot received. Analysing...");
        } catch (err) {
            console.error("Photo processing error:", err);
            await bot.sendMessage(chatId, "❌ Error processing screenshot.");
        }
    });

    /* ========================= FALLBACK ========================= */

    bot.on("message", async msg => {
        const chatId = msg.chat.id;

        // Ignore commands
        if (msg.text?.startsWith("/")) return;

        // Ignore photos (handled above)
        if (msg.photo) return;

        registerSubscriber(chatId);

        await bot.sendMessage(
            chatId,
            "📩 Send a trading chart screenshot for analysis."
        );
    });
}

/* ========================= HELPERS ========================= */

function registerSubscriber(chatId: number) {
    if (!storage.subscribers.includes(chatId)) {
        storage.subscribers = [...new Set([...storage.subscribers, chatId])];
        saveStorage(storage);
    }
}

export async function sendMessage(
    chatId: number,
    text: string,
    options?: TelegramBot.SendMessageOptions
) {
  const bot = getBot();
    if (!bot) throw new Error("Bot not initialized");

    try {
        await bot.sendMessage(chatId, text, options);
    } catch (err: any) {
        console.error("Telegram send error:", {
            chatId,
            code: err.response?.body?.error_code,
            desc: err.response?.body?.description
        });
    }
}
