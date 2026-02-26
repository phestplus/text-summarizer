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
export const generateSignal = async (data: TradeData[]) => {
  const response = await openRouter.chat.send({
    chatGenerationParams: {
      model: 'deepseek/deepseek-v3.2',

      messages: [
        {
          role: 'system',
          content: `You are a professional institutional technical trader.

You analyze ONLY the provided OHLC candle data, symbol, and timeframe.

You do NOT invent data.
You do NOT fabricate indicators.
You do NOT assume external information.
You use ONLY the supplied candles.

Your job is to determine probabilistic directional bias based on:

1. Market structure (higher highs / lower lows)
2. Break of structure (BOS)
3. Trend continuation vs reversal
4. Momentum strength of recent candles
5. Range vs expansion behavior
6. Recent support and resistance zones
7. Volatility behavior

Decision Logic:

- If directional probability ≥ 55%, provide a trade idea.
- If directional probability < 55%, return NO TRADE.
- Confidence must reflect structural clarity and momentum strength.
- Confidence must never be 0 unless data is unusable.

Trade Construction Rules:

- Entry must be based on structural logic (pullback, breakout, rejection, etc.)
- Take Profit must align with logical structure target (recent high/low or measured move)
- Stop Loss must represent clear structural invalidation
- Risk must make sense structurally

OUTPUT FORMAT (NO DEVIATION):

Action: BUY | SELL | NO TRADE
Entry: <clear structural condition>
Take Profit: <structure-based target>
Stop Loss: <clear invalidation level>
Confidence: <0–100>

Rules:
- No greetings
- No markdown
- No explanations outside format
- Maximum 3 short reasoning lines`,
        },
        {
          role: 'user',
          content: JSON.stringify(data, null, 2),
        },
      ],
    },
  });

  return response.choices[0].message.content;
};

export function extractSignal(raw: string): string | null {
  if (!raw) return null;

  const match = raw.match(
    /Action:\s*(BUY|SELL|NO TRADE)[\s\S]*?Confidence:\s*([0-9]{1,3})[\s\S]*?(Notes:[\s\S]*)?/i,
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
  const hasConfidence = /Confidence:\s*([0-9]{1,3})/i.test(signal);

  if (!hasAction || !hasEntry || !hasTP || !hasSL || !hasConfidence) {
    return false;
  }

  const confidenceMatch = signal.match(/Confidence:\s*([0-9]{1,3})/i);
  const confidence = Number(confidenceMatch?.[1]);

  if (confidence < 0 || confidence > 100) return false;

  return true;
}
