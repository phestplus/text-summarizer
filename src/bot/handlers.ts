// botInit.ts
import { ENV } from "@/configs/env";
import { tradeQueue } from "@/queue/jobs";
import TelegramBot from "node-telegram-bot-api";
import { getBot } from "@/configs/bot";
import { addSubscriber, getSubscribers } from "./storage";
import { connection } from "@/queue/redis";
import { formatSignalMarkdown } from "@/integration/ocr";
/* ========================= INIT BOT ========================= */
export function initBot(bot: TelegramBot) {
    /* ========================= COMMANDS ========================= */
    const commands = [
        {
            command: "start",
            description: "Start the bot and register yourself"
        },
        { command: "signal", description: "Generate a trade signal" },
        { command: "help", description: "Show instructions" }
    ];

    const adminCommands = [
        {
            command: "start",
            description: "Start the bot and register yourself"
        },
        { command: "signal", description: "Generate a trade signal" },
        {
            command: "broadcast",
            description: "Broadcast last signal (admin only)"
        },
        { command: "help", description: "Show instructions" },
        { command: "clear", description: "Clear Redis cache (admin only)" }
    ];

    // General commands
    bot.setMyCommands(commands);
    // Admin commands
    bot.setMyCommands(adminCommands, {
        scope: { type: "chat", chat_id: ENV.ADMIN_CHAT_ID }
    });

    /* ========================= START ========================= */
    bot.onText(/^\/start(?:@\w+)?$/, async msg => {
        const chatId = msg.chat.id;
        await registerSubscriber(chatId);

        await bot.sendMessage(
            chatId,
            `👋 *Welcome to TradeSignal Bot*\n\n📩 Send a trading pair and timeframe like \`EUR/USD 1h\` or \`BTC/USDT 5m\`.\n⏱ Timeframes: 1m,5m,15m,30m,1h,2h,4h,1d,1w\n\n⚠️ Signals are algorithmic insights, not financial advice.`,
            { parse_mode: "Markdown" }
        );
    });

    /* ========================= HELP ========================= */
    bot.onText(/^\/help(?:@\w+)?$/, async msg => {
        const chatId = msg.chat.id;
        await bot.sendMessage(
            chatId,
            `📌 *TradeSignal Bot Help*\n
/start - Register and see instructions
/signal - Generate a trade signal (select pair/timeframe)
/help - Show this help
/admin only:
/clear - Clear Redis cache
/broadcast - Broadcast last signal`,
            { parse_mode: "Markdown" }
        );
    });

    /* ========================= SIGNAL COMMAND ========================= */
    bot.onText(/^\/signal(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
        const chatId = msg.chat.id;
        const input = match?.[1]?.trim();

        if (!input) {
            // Show inline pairs
            const tradingPairs = [
                // Major pairs
                "EUR/USD",
                "GBP/USD",
                "USD/JPY",
                "USD/CHF",
                "USD/CAD",
                "AUD/USD",
                "NZD/USD",

                // Minor pairs / crosses supported by Twelve Data
                "EUR/GBP",
                "EUR/JPY",
                "EUR/CHF",
                "GBP/JPY",
                "GBP/CHF",
                "AUD/JPY",
                "AUD/NZD",
                "NZD/JPY",
                "CAD/JPY",
                "CHF/JPY"
            ];
            const keyboard: any[][] = [];
            for (let i = 0; i < tradingPairs.length; i += 2) {
                const row = tradingPairs.slice(i, i + 2).map(pair => ({
                    text: pair,
                    callback_data: `pair_${pair.replace("/", "")}`
                }));
                keyboard.push(row);
            }
            await bot.sendMessage(chatId, "📊 Select trading pair:", {
                reply_markup: { inline_keyboard: keyboard }
            });
            return;
        }

        // User typed input → validate
        const parts = input.split(/\s+/);
        if (parts.length !== 2) {
            await bot.sendMessage(
                chatId,
                "⚠️ Invalid format. Example: `/signal EUR/USD 1h`",
                { parse_mode: "Markdown" }
            );
            return;
        }

        const symbol = parts[0].toUpperCase();
        const timeframe = parts[1].toLowerCase();
        const validTimeframes = [
            "1m",
            "5m",
            "15m",
            "30m",
            "1h",
            "2h",
            "4h",
            "1d",
            "1w"
        ];
        if (!validTimeframes.includes(timeframe)) {
            await bot.sendMessage(
                chatId,
                `⚠️ Invalid timeframe. Choose from: ${validTimeframes.join(
                    ", "
                )}`,
                { parse_mode: "Markdown" }
            );
            return;
        }

        // Add to queue
        await tradeQueue.add("trade", {
            chatId,
            text: `${symbol} ${timeframe}`
        });
        await bot.sendMessage(chatId, `✅ Analysing ${symbol} ${timeframe}...`);
    });

    /* ========================= CALLBACK QUERIES ========================= */
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
                "1d",
                "1w"
            ];
            const keyboard: any[][] = [];
            for (let i = 0; i < timeframes.length; i += 3) {
                const row = timeframes.slice(i, i + 3).map(tf => ({
                    text: tf,
                    callback_data: `tf_${pair}_${tf}`
                }));
                keyboard.push(row);
            }
            await bot.sendMessage(chatId, `⏱ Select timeframe for ${pair}`, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }

        if (data.startsWith("tf_")) {
            const [, pair, timeframe] = data.split("_");
            await tradeQueue.add("trade", {
                chatId,
                text: `${pair} ${timeframe}`
            });

            await bot.sendMessage(
                chatId,
                `✅ Analysing ${pair} ${timeframe}...`
            );
        }

        await bot.answerCallbackQuery(query.id);
    });

    /* ========================= ADMIN COMMANDS ========================= */
    bot.onText(/\/clear/, async msg => {
        const chatId = msg.chat.id;
        if (chatId !== ENV.ADMIN_CHAT_ID)
            return await bot.sendMessage(
                chatId,
                "❌ Unauthorized: admin only."
            );
        try {
            const keys = await connection.keys("*");
            if (keys.length) await connection.del(keys);
            await bot.sendMessage(chatId, "✅ Redis cache cleared.");
            return;
        } catch (err) {
            console.error(err);
            await bot.sendMessage(chatId, "❌ Failed to clear Redis cache.");
            return;
        }
    });

    bot.onText(/\/broadcast/, async msg => {
        const chatId = msg.chat.id;
        if (chatId !== ENV.ADMIN_CHAT_ID)
            return await bot.sendMessage(
                chatId,
                "❌ Unauthorized: admin only."
            );

        const rawSignal = await connection.get("lastSignal");

        if (!rawSignal)
            return await bot.sendMessage(
                chatId,
                "⚠️ No signal to broadcast yet."
            );
        const lastSignal = JSON.parse(rawSignal);
        const chatIds = await getSubscribers();
        for (const userId of chatIds) {
            const md = formatSignalMarkdown(lastSignal);
            await sendMessage(userId, md, { parse_mode: "Markdown" });
        }
        await bot.sendMessage(
            chatId,
            `✅ Broadcast sent to ${chatIds.length} users.`
        );
        return;
    });

    /* ========================= FALLBACK ========================= */
    bot.on("message", async msg => {
        const chatId = msg.chat.id;
        if (msg.text?.startsWith("/")) return;

        await registerSubscriber(chatId);
        await bot.sendMessage(
            chatId,
            "📩 Send a trading pair and timeframe to generate a signal. Example: `EUR/USD 1h`",
            { parse_mode: "Markdown" }
        );
    });
}

/* ========================= HELPERS ========================= */
async function registerSubscriber(chatId: number) {
    await addSubscriber(chatId);
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
