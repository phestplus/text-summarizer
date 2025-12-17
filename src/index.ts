import { ENV } from '@configs/env';
import { initBot } from '@bot/handlers';

initBot(ENV.TELEGRAM_TOKEN);

console.log('Telegram Summarizer Bot started ✅');