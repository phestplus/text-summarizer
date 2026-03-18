// botInit.ts
import { ENV } from "@/configs/env";
import { tradeQueue } from "@/queue/jobs";
import TelegramBot from "node-telegram-bot-api";
import { getBot } from "@/configs/bot";
import { addSubscriber, getSubscribers } from "./storage";
import { connection } from "@/queue/redis";
import { formatSignalMarkdown } from "@/integration/ocr";

// ========================= SESSION TRACKER =========================
interface Session {
    step: "capital" | "pair" | "timeframe";
    capital?: number | null;
    pair?: string;
}
const sessions: Record<number, Session> = {};

// ========================= INIT BOT =========================
export function initBot(bot: TelegramBot) {
    const commands = [
        { command: "start", description: "Start the bot and register yourself" },
        { command: "signal", description: "Generate a trade signal" },
        { command: "help", description: "Show instructions" }
    ];

    const adminCommands = [
        ...commands,
        { command: "broadcast", description: "Broadcast last signal (admin only)" },
        { command: "clear", description: "Clear Redis cache (admin only)" }
    ];

    bot.setMyCommands(commands);
    bot.setMyCommands(adminCommands, {
        scope: { type: "chat", chat_id: ENV.ADMIN_CHAT_ID }
    });

    // ========================= START =========================
    bot.onText(/^\/start(?:@\w+)?$/, async msg => {
        const chatId = msg.chat.id;
        await registerSubscriber(chatId);
        await bot.sendMessage(
            chatId,
            `👋 *Welcome to TradeSignal Bot*\n\nUse /signal to start generating a trade signal.\n\n⚠️ Signals are algorithmic insights, not financial advice.`,
            { parse_mode: "Markdown" }
        );
    });

    // ========================= HELP =========================
    bot.onText(/^\/help(?:@\w+)?$/, async msg => {
        const chatId = msg.chat.id;
        await bot.sendMessage(
            chatId,
            `📌 *TradeSignal Bot Help*\n/start - Register\n/signal - Generate signal\nFormat:\`EUR/USD 1h\` or optional capital: \`1000 EUR/USD 1h\``,
            { parse_mode: "Markdown" }
        );
    });

    // ========================= SIGNAL COMMAND =========================
    bot.onText(/^\/signal(?:@\w+)?$/, async msg => {
        const chatId = msg.chat.id;
        sessions[chatId] = { step: "capital" };
        await bot.sendMessage(chatId, "💰 Enter your capital (or press Enter to skip):");
    });

    // ========================= MESSAGE HANDLER =========================
    bot.on("message", async msg => {
        const chatId = msg.chat.id;
        const text = msg.text?.trim();
        if (!text || text.startsWith("/")) return;

        const session = sessions[chatId];
        if (!session || session.step !== "capital") return;

        if (text) {
            const cap = Number(text);
            if (isNaN(cap) || cap <= 0) {
                await bot.sendMessage(chatId, "⚠️ Capital must be a positive number. Try again:");
                return;
            }
            session.capital = cap;
        } else {
            session.capital = null; // user skipped
        }

        session.step = "pair";

        // ========================= PAIR INLINE =========================
        const tradingPairs = [
            "EUR/USD","GBP/USD","USD/JPY","USD/CHF","USD/CAD",
            "AUD/USD","NZD/USD","EUR/GBP","EUR/JPY","EUR/CHF",
            "GBP/JPY","GBP/CHF","AUD/JPY","AUD/NZD","NZD/JPY",
            "CAD/JPY","CHF/JPY"
        ];

        const keyboard: any[][] = [];
        for (let i = 0; i < tradingPairs.length; i += 2) {
            keyboard.push(
                tradingPairs.slice(i, i + 2).map(pair => ({
                    text: pair,
                    callback_data: `pair_${pair.replace("/", "")}_${session.capital ?? 0}`
                }))
            );
        }

        await bot.sendMessage(chatId, "📊 Select trading pair:", {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    // ========================= CALLBACK =========================
    bot.on("callback_query", async query => {
        const chatId = query.message!.chat.id;
        const data = query.data!;
        const session = sessions[chatId];

        if (!session) return;

        // ========================= PAIR SELECTION =========================
        if (data.startsWith("pair_") && session.step === "pair") {
            const [, pairRaw, capStr] = data.split("_");
            const pair = pairRaw.slice(0, 3) + "/" + pairRaw.slice(3); // USDJPY → USD/JPY
            session.pair = pair;
            session.capital = Number(capStr) || null;
            session.step = "timeframe";

            const timeframes = ["1m","5m","15m","30m","1h","2h","4h","1d","1w"];
            const keyboard: any[][] = [];
            for (let i = 0; i < timeframes.length; i += 3) {
                keyboard.push(
                    timeframes.slice(i, i + 3).map(tf => ({
                        text: tf,
                        callback_data: `tf_${tf}`
                    }))
                );
            }

            await bot.sendMessage(chatId, `⏱ Select timeframe for ${pair}:`, {
                reply_markup: { inline_keyboard: keyboard }
            });
            await bot.answerCallbackQuery(query.id);
            return;
        }

        // ========================= TIMEFRAME SELECTION =========================
        if (data.startsWith("tf_") && session.step === "timeframe") {
            const tf = data.replace("tf_", "");
            // enqueue trade
            await tradeQueue.add("trade", {
                chatId,
                text: `${session.pair} ${tf}`,
                capital: session.capital ?? null
            });

            await bot.sendMessage(
                chatId,
                `✅ Analysing ${session.pair} ${tf}${session.capital ? ` with $${session.capital}` : ""}...`
            );

            delete sessions[chatId];
            await bot.answerCallbackQuery(query.id);
            return;
        }
    });

    // ========================= ADMIN COMMANDS =========================
    bot.onText(/\/clear/, async msg => {
        const chatId = msg.chat.id;
        if (chatId !== ENV.ADMIN_CHAT_ID) return bot.sendMessage(chatId, "❌ Unauthorized");

        const keys = await connection.keys("*");
        if (keys.length) await connection.del(keys);
        await bot.sendMessage(chatId, "✅ Redis cleared");
    });

    bot.onText(/\/broadcast/, async msg => {
        const chatId = msg.chat.id;
        if (chatId !== ENV.ADMIN_CHAT_ID) return bot.sendMessage(chatId, "❌ Unauthorized");

        const rawSignal = await connection.get("lastSignal");
        if (!rawSignal) return bot.sendMessage(chatId, "⚠️ No signal");

        const lastSignal = JSON.parse(rawSignal);
        const chatIds = await getSubscribers();

        for (const userId of chatIds) {
            const md = formatSignalMarkdown(lastSignal);
            await sendMessage(userId, md, { parse_mode: "Markdown" });
        }

        await bot.sendMessage(chatId, `✅ Broadcast sent to ${chatIds.length} users`);
    });
}

// ========================= HELPERS =========================
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
        console.error("Telegram error:", err.response?.body);
    }
}