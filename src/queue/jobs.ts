import { sendMessage } from '@bot/handlers';
import { extractSignal, generateSignal, validateSignal } from '@configs/ai';
import { ENV } from '@configs/env';
import { getMarketData } from '@configs/twelveData';
import adminServices from 'admin/services';
import axios from 'axios';
import fs from 'fs';
import { cleanup, extractTradeInput, runImageOCR } from 'integration/ocr';
import path from 'path';
import userServices from 'user/services';
import { Job, Queue, Worker, connection } from './redis';
// Create the queue
const tradeQueue = new Queue('analyze', { connection });

// Create a worker to process jobs
new Worker(
  'analyze',
  async (job: Job) => {
    try {
      switch (job.name) {
        case 'analyze-photo':
          const chatId = job.data.chatId;
          const filePath = job.data.filePath;
          const fileUrl = `https://api.telegram.org/file/bot${ENV.TELEGRAM_TOKEN}/${filePath}`;
          const imagePath = path.join('../../', `chart_${chatId}.jpg`);

          const response = await axios({ url: fileUrl, responseType: 'stream' });
          const writer = fs.createWriteStream(imagePath);

          response.data.pipe(writer);

          writer.on('finish', async () => {
            try {
              const ocrText = await runImageOCR(imagePath);

              console.log('OCR RESULT:', ocrText);

              const tradeInput = extractTradeInput(ocrText);

              if (!tradeInput) {
                await sendMessage(chatId, '⚠️ Unable to extract valid trade data from screenshot.');
                cleanup(imagePath);
                return;
              }

              const data = await getMarketData(tradeInput.symbol, tradeInput.timeframe);
              console.log('data', data);
              /* ---------------- AI SIGNAL ---------------- */
              const rawSignal = await generateSignal(
                data,
                tradeInput.symbol,
                tradeInput.timeframes,
              );

              const cleanSignal = extractSignal(rawSignal);

              if (!cleanSignal || !validateSignal(cleanSignal)) {
                await sendMessage(chatId, '⚠️ Signal generation failed. Try another screenshot.');
                cleanup(imagePath);
                return;
              }
              console.log('cleanSignal', cleanSignal);
              await sendMessage(chatId, cleanSignal, { parse_mode: 'Markdown' });

              cleanup(imagePath);
            } catch (err) {
              console.log('err', err);
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
      console.log('error queue', error);
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
