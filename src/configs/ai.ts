import { connection } from '@/queue/redis';
import { OpenRouter } from '@openrouter/sdk';
import { ENV } from './env';
import { timeframeToSeconds } from './twelveData';

export interface TradeData {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

const openRouter = new OpenRouter({
  apiKey: ENV.OPEN_ROUTER_API_KEY,
});

export const generateSignal = async (data: TradeData[], symbol: string, timeframe: string) => {
  const cacheKey = `ai_${symbol}_${timeframe}`;
  const cachedData = await connection.get(cacheKey);
  if (cachedData) {
    const data = cachedData;
    return data;
  }

  if (!data || data.length < 20) {
    throw new Error('Insufficient candle data');
  }

  // Ensure oldest → newest
  const ordered = [...data].reverse();

  // Convert strings → numbers
  const normalized = ordered.map((c) => ({
    datetime: c.datetime,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  }));

  const response = await openRouter.chat.send({
    chatGenerationParams: {
      model: 'deepseek/deepseek-v3.2',
      messages: [
        {
          role: 'system',
          content: `You are an institutional probabilistic technical trader.

Analyze ONLY the provided OHLC candle data, symbol, and timeframe.

You must determine:
- Market structure (trend strength 0–100%)
- Break of structure
- Momentum strength (0–100%)
- Volatility behavior (0–100%)

Based on these factors, calculate a confidence 0–100 that reflects the probability the market will move in the trade direction.
- Strong trend, clear break, strong momentum → high confidence (80–100)
- Moderate trend or minor break → medium confidence (50–79)
- Weak trend, unclear structure → low confidence (25–49)
- Invalid or unclear data → 0

OUTPUT FORMAT STRICTLY:

Action: BUY | SELL | NO TRADE
Entry: <clear structural condition>
Take Profit: <structure-based target>
Stop Loss: <clear invalidation level>
Confidence: <0–100>
Notes:
- <short reasoning line 1>
- <short reasoning line 2>
- <short reasoning line 3>

Rules:
- Notes must be max 3 short lines
- No greetings, no markdown, no extra text outside format`.trim(),
        },
        {
          role: 'user',
          content: `
SYMBOL: ${symbol}
TIMEFRAME: ${timeframe}
TOTAL CANDLES: ${normalized.length}

CANDLE DATA (oldest to newest):
${JSON.stringify(normalized, null, 2)}

Perform full structural technical analysis.
          `.trim(),
        },
      ],
    },
  });
  connection.setex(
    cacheKey,
    timeframeToSeconds(timeframe),
    JSON.stringify(response.choices[0].message.content, null, 2),
  );
  return response.choices[0].message.content;
};

export function extractSignal(raw: string, symbol?: string, timeframe?: string): string | null {
  if (!raw) return null;

  const match = raw.match(
    /Action:\s*(BUY|SELL|NO TRADE)[\s\S]*?Confidence:\s*([0-9]{1,3})[\s\S]*?Notes:[\s\S]*/i,
  );

  if (!match) return null;

  let signalBlock = match[0].trim();

  /* -------- BOLD KEYS FOR TELEGRAM -------- */

  const keys = ['Action', 'Entry', 'Take Profit', 'Stop Loss', 'Confidence', 'Notes'];

  for (const key of keys) {
    const regex = new RegExp(`^${key}:`, 'gim');
    signalBlock = signalBlock.replace(regex, `*${key}:*`);
  }

  /* -------- HEADER -------- */

  const header = `📊 *Trade Signal*

${symbol ? `*Pair:* ${symbol}\n` : ''}${timeframe ? `*Timeframe:* ${timeframe}\n` : ''}
`;

  return `${header}\n${signalBlock}`;
}
export function validateSignal(signal: string): boolean {
  if (!signal) return false;

  /* ---------- tolerant key matcher ---------- */
  const key = (name: string) => new RegExp(`\\*?${name}:\\*?`, 'i');

  const hasAction = new RegExp(`\\*?Action:\\*?\\s*(BUY|SELL|NO TRADE)`, 'i').test(signal);
  const hasEntry = key('Entry').test(signal);
  const hasTP = key('Take Profit').test(signal);
  const hasSL = key('Stop Loss').test(signal);
  const confidenceMatch = signal.match(new RegExp(`\\*?Confidence:\\*?\\s*([0-9]{1,3})`, 'i'));
  const hasNotes = new RegExp(`\\*?Notes:\\*?\\s*[-•]`, 'i').test(signal);

  if (!hasAction || !hasEntry || !hasTP || !hasSL || !confidenceMatch || !hasNotes) {
    return false;
  }

  const confidence = Number(confidenceMatch[1]);

  if (Number.isNaN(confidence) || confidence < 0 || confidence > 100) {
    return false;
  }

  return true;
}
