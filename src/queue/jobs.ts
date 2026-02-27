import adminServices from '@/admin/services';
import { sendMessage } from '@/bot/handlers';
import { extractSignal, generateSignal, validateSignal } from '@/configs/ai';
import { getMarketData } from '@/configs/twelveData';
import { cleanup, extractTradeInput, normalizeSymbol, runImageOCR } from '@/integration/ocr';
import userServices from '@/user/services';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Job, Queue, Worker, connection } from './redis';
// Create the queue
const tradeQueue = new Queue('analyze', { connection });

// Create a worker to process jobs
new Worker(
  'analyze',
  async (job: Job) => {
    try {
      const chatId = job.data.chatId;
      switch (job.name) {
        case 'trade':
          const message: string = job.data.text;
          const parts = message.trim().split(/\s+/);

          const symbol = normalizeSymbol(parts[0]);
          const timeframe = parts[1]?.toLowerCase(); // ✅ normalize timeframe

          // Basic validation before hitting services
          if (!symbol || !timeframe) {
            await sendMessage(chatId, '⚠️ Invalid trade format. Example: EUR/USD 1h');
            return;
          }

          try {
            const data = await getMarketData(symbol, timeframe);
            /* ---------------- AI SIGNAL ---------------- */

            const rawSignal = await generateSignal(data, symbol, timeframe);
            const cleanSignal = extractSignal(rawSignal, symbol, timeframe);

            if (!cleanSignal || !validateSignal(cleanSignal)) {
              await sendMessage(
                chatId,
                '⚠️ Signal generation failed. Please try another pair or timeframe.',
              );
              return;
            }

            await sendMessage(chatId, cleanSignal, { parse_mode: 'Markdown' });
          } catch (err: any) {
            console.log('err', err);
            // ✅ corrected error message
            await sendMessage(
              chatId,
              `❌ Unable to analyse trade please try again. ${err.message}`,
            );
          }

          break;
        case 'analyze-photo':
          const fileUrl = job.data.fileUrl;
          const imagePath = path.join('../../', `chart_${chatId}.jpg`);

          const response = await axios({ url: fileUrl, responseType: 'stream' });
          const writer = fs.createWriteStream(imagePath);

          response.data.pipe(writer);

          writer.on('finish', async () => {
            try {
              const ocrText = await runImageOCR(imagePath);

              const tradeInput = extractTradeInput(ocrText);

              if (!tradeInput) {
                await sendMessage(chatId, '⚠️ Unable to extract valid trade data from screenshot.');
                cleanup(imagePath);
                return;
              }

              const data = await getMarketData(tradeInput.symbol, tradeInput.timeframe);
              /* ---------------- AI SIGNAL ---------------- */
              const rawSignal = await generateSignal(data, tradeInput.symbol, tradeInput.timeframe);

              const cleanSignal = extractSignal(rawSignal, tradeInput.symbol, tradeInput.timeframe);

              if (!cleanSignal || !validateSignal(cleanSignal)) {
                await sendMessage(chatId, '⚠️ Signal generation failed. Try another screenshot.');
                cleanup(imagePath);
                return;
              }
              await sendMessage(chatId, cleanSignal, { parse_mode: 'Markdown' });

              cleanup(imagePath);
            } catch (err) {
              await sendMessage(chatId, '❌ OCR analysis failed.');
              cleanup(imagePath);
            }
          });
          break;

        case 'admin-service':
          const adminResult = await adminServices.runAdminService(job.data.sevice);
          if (adminResult) {
            await sendMessage(job.data.chatId, adminResult);
          }

          break;

        case 'user-service':
          const userResult = await userServices.runUserService(job.data.sevice);
          if (userResult) {
            await sendMessage(job.data.chatId, userResult);
          }

          break;
        case 'admin-broadcast':
          const { chatIds, service } = job.data;
          const adminBroadcastResult = await adminServices.runAdminService(service);
          if (adminBroadcastResult) {
            for (const chatId of chatIds) {
              await sendMessage(chatId, adminBroadcastResult);
            }
          }

          break;

        default:
          console.warn('Unknown job type:', job.name);
      }
    } catch (error) {
      await sendMessage(
        job.data.chatId,
        `⚠️ Our summarization service is temporarily unavailable.  
Please try again in a few minutes. Thank you for your patience.`,
      );
    }
  },
  { connection },
);

export { tradeQueue };
