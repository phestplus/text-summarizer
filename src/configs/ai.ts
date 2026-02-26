import { OpenRouter } from '@openrouter/sdk';
import { ENV } from './env';

interface TradeData {
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
          content: `
You are a probabilistic institutional technical trader.

You analyze ONLY the provided OHLC candle data, symbol, and timeframe.

You must determine:
- Market structure (trend or range)
- Break of structure (if any)
- Momentum strength
- Volatility behavior

If directional probability ≥ 55%, provide a trade idea.
If < 55%, return NO TRADE.

Confidence must reflect structural clarity.
Confidence must never be 0 unless data is invalid.

OUTPUT FORMAT (NO DEVIATION):

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
- Notes must be maximum 3 short lines
- No greetings
- No markdown
- No extra text outside format
          `.trim(),
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

  return response.choices[0].message.content;
};

export function extractSignal(raw: string): string | null {
  if (!raw) return null;

  const match = raw.match(
    /Action:\s*(BUY|SELL|NO TRADE)[\s\S]*?Confidence:\s*([0-9]{1,3})[\s\S]*?Notes:[\s\S]*/i,
  );

  if (!match) return null;

  return match[0].trim();
}

export function validateSignal(signal: string): boolean {
  if (!signal) return false;

  const hasAction = /Action:\s*(BUY|SELL|NO TRADE)/i.test(signal);
  const hasEntry = /Entry:/i.test(signal);
  const hasTP = /Take Profit:/i.test(signal);
  const hasSL = /Stop Loss:/i.test(signal);
  const confidenceMatch = signal.match(/Confidence:\s*([0-9]{1,3})/i);
  const hasNotes = /Notes:\s*-\s*/i.test(signal);

  if (!hasAction || !hasEntry || !hasTP || !confidenceMatch || !hasNotes) {
    return false;
  }

  const confidence = Number(confidenceMatch[1]);

  if (confidence < 0 || confidence > 100) return false;

  return true;
}
