// src/index.ts
import express, { Request, Response, NextFunction } from "express";
import { createBot, getBot, stopBot } from "@configs/bot";
import { ENV } from "@configs/env";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to check secret query code
function checkSecret(req: Request, res: Response, next: NextFunction): void {
  const code = req.query.code as string;
  if (!code || code !== ENV.ADMIN_CODE) {
    res.status(401).send("Unauthorized ❌");
    return;
  }
  next();
}

// Start bot endpoint
app.get("/start-bot", checkSecret, (req: Request, res: Response): void => {
  if (getBot()) {
    res.send("Bot is already running ✅");
    return;
  }

  const bot = createBot();
  res.send("Telegram Trading Bot started ✅");
  console.log("✅ Bot initialized");
});

// Stop bot endpoint
app.get("/stop-bot", checkSecret, async (req: Request, res: Response): Promise<void> => {
  if (!getBot()) {
    res.send("Bot is not running ❌");
    return;
  }

  await stopBot();
  res.send("Telegram Trading Bot stopped ✅");
});

// Health check endpoint
app.get("/", (_req: Request, res: Response): void => {
  res.send("Bot server is running 🟢");
});

// Start Express server
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));