import express, { Request, Response, NextFunction } from "express";
import { createBot, getBot } from "@configs/bot";
import { initBot } from "@bot/handlers";
import { ENV } from "@configs/env";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to check secret code
function checkSecret(req: Request, res: Response, next: NextFunction): void {
    const code = req.query.code as string;
    if (!code || code !== ENV.ADMIN_CODE) {
        res.status(401).send("Unauthorized ❌");
        return; // explicitly exit
    }
    next(); // continue if authorized
}

// Start bot
app.get("/start-bot", checkSecret, (req: Request, res: Response): void => {
    const bot = getBot();
    if (bot) {
        res.send("Bot is already running ✅");
        return; // explicit return
    }

    const newBot = createBot();
    initBot(newBot);

    console.log("✅ Bot initialized");
    res.send("Telegram Trading Bot started ✅");
});
// Stop bot
app.get(
    "/stop-bot",
    checkSecret,
    async (req: Request, res: Response): Promise<void> => {
        const bot = getBot();
        if (!bot) {
            res.send("Bot is not running ❌");
            return;
        }

        await bot.stopPolling();

        console.log("Telegram Trading Bot stopped ✅");
        res.send("Telegram Trading Bot stopped ✅");
    }
);

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
