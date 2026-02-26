import { initBot } from '@bot/handlers';
import { ENV } from '@configs/env';

initBot(ENV.TELEGRAM_TOKEN);

console.log('Telegram Trading Bot started ✅');
