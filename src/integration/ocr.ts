import fs from 'fs';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
export type TradeInput = {
  rsi?: number;
  macd?: number;
  symbol: string;
  timeframe: string;
};
export async function runImageOCR(imagePath: string): Promise<string> {
  const processedPath = imagePath.replace('.jpg', '_processed.png');

  try {
    /* -------- IMAGE PREPROCESSING (VERY IMPORTANT) -------- */
    await sharp(imagePath).grayscale().normalize().sharpen().toFile(processedPath);

    /* -------- OCR -------- */
    const result = await Tesseract.recognize(processedPath, 'eng');

    const text = result.data.text;

    return text;
  } finally {
    if (fs.existsSync(processedPath)) fs.unlinkSync(processedPath);
  }
}
export function extractTradeInput(text: string): TradeInput | null {
  console.log('text', text);
  if (!text) return null;

  const normalized = text
    .replace(/R5I/gi, 'RSI')
    .replace(/RS1/gi, 'RSI')
    .replace(/RSl/gi, 'RSI')
    .replace(/M4CD/gi, 'MACD')
    .replace(/[^a-zA-Z0-9\.\:\-\s]/g, ' ');

  const input: TradeInput = { symbol: 'EUR/USD', timeframe: '1h' };

  /* ---------------- RSI ---------------- */
  const rsiMatch = normalized.match(/RSI[\s:\-]*([0-9]{1,3}\.?[0-9]*)/i);
  if (rsiMatch) {
    const value = parseFloat(rsiMatch[1]);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      input.rsi = value;
    }
  }

  /* ---------------- MACD ---------------- */
  const macdMatch = normalized.match(/MACD[\s:\-]*(-?[0-9]{1,3}\.?[0-9]*)/i);
  if (macdMatch) {
    const value = parseFloat(macdMatch[1]);
    if (!isNaN(value)) {
      input.macd = value;
    }
  }

  /* ---------------- SYMBOL ---------------- */
  /* ---------------- SYMBOL ---------------- */
  const symbolMatch = normalized.match(/\b[A-Z]{6}\b/i);

  if (symbolMatch) {
    input.symbol = normalizeSymbol(symbolMatch[0].toUpperCase());
  }

  /* ---------------- TIMEFRAME ---------------- */
  const cleaned = normalized.replace(/\b[I|l](?=[mhdw])/gi, '1');

  const tfMatch = cleaned.match(/\b(\d{1,3})([mhdw]|mn)\b/i);

  if (tfMatch) {
    input.timeframe = (tfMatch[1] + tfMatch[2]).toLowerCase();
  }

  if (Object.keys(input).length === 0) return null;
  console.log('input', input);
  return input;
}
export function normalizeSymbol(symbol: string) {
  const knownQuotes = [
    'USDT',
    'USDC',
    'USD',
    'BTC',
    'ETH',
    'EUR',
    'JPY',
    'GBP',
    'AUD',
    'CAD',
    'CHF',
    'NZD',
  ];

  for (const quote of knownQuotes) {
    if (symbol.endsWith(quote)) {
      const base = symbol.slice(0, symbol.length - quote.length);
      return `${base}/${quote}`;
    }
  }

  return symbol; // fallback (do nothing)
}
export function cleanup(...files: string[]) {
  for (const file of files) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
export function formatSignalMessage(input: any, signal: string) {
  return `📈 *Analysis Complete*

${input.symbol ? `Pair: *${input.symbol}*\n` : ''}
${input.timeframe ? `Timeframe: *${input.timeframe}*\n` : ''}
${input.rsi !== undefined ? `RSI: *${input.rsi}*\n` : ''}
${input.macd !== undefined ? `MACD: *${input.macd}*\n` : ''}

Signal: *${signal}*`;
}
