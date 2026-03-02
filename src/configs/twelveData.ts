import { connection } from '@/queue/redis';
import axios from 'axios';
import { TradeData } from './ai';
import { ENV } from './env';

export async function getMarketData(symbol: string, interval: string): Promise<TradeData[]> {
  const cacheKey = `twelve_data_${symbol}_${interval}`;
  const cachedData = await connection.get(cacheKey);
  if (cachedData) {
    const data = JSON.parse(cachedData);
    return data;
  }
  const res = await axios.get(
    `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=30&apikey=${ENV.TWELVE_DATA_API_KEY}`,
  );
  connection.setex(
    cacheKey,
    timeframeToSeconds(interval),
    JSON.stringify(res.data.values, null, 2),
  );
  return res.data.values;
}
export function timeframeToSeconds(tf: string): number {
  if (!tf) return 3600;

  const match = tf.trim().match(/^(\d+)([smhdw])$/i);
  if (!match) return 3600;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  const unitMap: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
    w: 60 * 60 * 24 * 7,
  };

  return value * unitMap[unit];
}
