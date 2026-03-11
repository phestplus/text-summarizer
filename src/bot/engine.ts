import axios from "axios";
import { ENV } from "@/configs/env";

interface Candle {
    datetime: string;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface SignalResult {
    pair: string;
    signal: "BUY" | "SELL" | "HOLD";
    confidence: number;
    entry: number | null;
    stop_loss: number | null;
    take_profit: number | null;
    risk_reward: number | null;
    spread: number;
    trend_timeframe: string;
    entry_timeframe: string;
    trend: string;
    momentum: string;
    volatility: string;
    timestamp: string;
}

const CONFIG = {
    EMA_FAST: 9,
    EMA_SLOW: 21,
    RSI_PERIOD: 14,
    ATR_PERIOD: 14,
    ATR_SL_MULTIPLIER: 1.5,
    RISK_REWARD: 2,
    MIN_CANDLES: 120,
    RSI_OVERBOUGHT: 70,
    RSI_OVERSOLD: 30
};

// ------------------------ Indicators ------------------------

function ema(values: number[], period: number) {
    const k = 2 / (period + 1);
    const result: number[] = [];
    values.forEach((v, i) => {
        if (i === 0) result.push(v);
        else result.push(v * k + result[i - 1] * (1 - k));
    });
    return result;
}

function rsi(values: number[], period: number) {
    const result: number[] = [];
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
        const diff = values[i] - values[i - 1];
        diff >= 0 ? gain += diff : loss -= diff;
    }
    gain /= period;
    loss /= period;
    result[period] = 100 - 100 / (1 + gain / (loss || 1));

    for (let i = period + 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        const g = diff > 0 ? diff : 0;
        const l = diff < 0 ? -diff : 0;
        gain = (gain * (period - 1) + g) / period;
        loss = (loss * (period - 1) + l) / period;
        result[i] = 100 - 100 / (1 + gain / (loss || 1));
    }
    return result;
}

function atr(candles: Candle[], period: number) {
    const tr: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high;
        const l = candles[i].low;
        const pc = candles[i - 1].close;
        tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const result: number[] = [];
    let first = tr.slice(0, period).reduce((a, b) => a + b) / period;
    result[period] = first;
    for (let i = period + 1; i < tr.length; i++) {
        result[i] = (result[i - 1] * (period - 1) + tr[i]) / period;
    }
    return result;
}

// ------------------------ Utilities ------------------------

async function fetchCandles(symbol: string, interval: string) {
    const { data } = await axios.get("https://api.twelvedata.com/time_series", {
        params: { symbol, interval, outputsize: CONFIG.MIN_CANDLES, apikey: ENV.TWELVE_DATA_API_KEY }
    });
    if (!data.values) throw new Error("Market data unavailable");
    const candles = data.values.map((c: any) => ({
        datetime: c.datetime,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close)
    })).reverse();
    if (candles.length < CONFIG.MIN_CANDLES) throw new Error("Insufficient market data");
    return candles;
}

function classifyVolatility(atrValues: number[]) {
    const recent = atrValues.at(-1)!;
    const avg = atrValues.slice(-CONFIG.ATR_PERIOD).reduce((a, b) => a + b) / CONFIG.ATR_PERIOD;
    if (recent > avg * 1.25) return "high";
    if (recent < avg * 0.75) return "low";
    return "normal";
}

// ------------------------ Signal Engine ------------------------

export async function generateSignal(
    pair: string,
    entryTF = "5min",
    trendTF = "1h",
    spread = 0.0001
): Promise<SignalResult> {

    const entryCandles = await fetchCandles(pair, entryTF);
    const trendCandles = await fetchCandles(pair, trendTF);

    const entryCloses = entryCandles.map(c => c.close);
    const trendCloses = trendCandles.map(c => c.close);

    const entryFast = ema(entryCloses, CONFIG.EMA_FAST);
    const entrySlow = ema(entryCloses, CONFIG.EMA_SLOW);
    const trendFast = ema(trendCloses, CONFIG.EMA_FAST);
    const trendSlow = ema(trendCloses, CONFIG.EMA_SLOW);

    const rsiVals = rsi(entryCloses, CONFIG.RSI_PERIOD);
    const atrVals = atr(entryCandles, CONFIG.ATR_PERIOD);

    const lastPrice = entryCloses.at(-1)!;

    const entryTrend = entryFast.at(-1)! > entrySlow.at(-1)! ? "bullish" : "bearish";
    const trendTrend = trendFast.at(-1)! > trendSlow.at(-1)! ? "bullish" : "bearish";

    // Base signal
    let baseSignal: "BUY" | "SELL" | "HOLD" = "HOLD";
    if (entryTrend === "bullish" && trendTrend === "bullish") baseSignal = "BUY";
    if (entryTrend === "bearish" && trendTrend === "bearish") baseSignal = "SELL";

    // ---------------- Confidence ----------------
    let confidence = 50;
    if (entryTrend === trendTrend && baseSignal !== "HOLD") confidence += 25;
    const rsiLast = rsiVals.at(-1)!;
    if (rsiLast > 50 && baseSignal === "BUY") confidence += 10;
    if (rsiLast < 50 && baseSignal === "SELL") confidence += 10;

    const volatility = classifyVolatility(atrVals);
    if (volatility === "normal") confidence += 10;

    confidence = Math.min(100, Math.max(0, Math.round(confidence)));

    // ---------------- Signal decision ----------------
    let signal: "BUY" | "SELL" | "HOLD" = "HOLD";
    if (confidence >= 60) signal = baseSignal;
    else signal = "HOLD";

    // ---------------- Entry / SL / TP ----------------
    let entry: number | null = null;
    let sl: number | null = null;
    let tp: number | null = null;

    if (signal === "BUY") {
        entry = lastPrice + spread;
        sl = entry - atrVals.at(-1)! * CONFIG.ATR_SL_MULTIPLIER;
        tp = entry + (entry - sl) * CONFIG.RISK_REWARD;
    }

    if (signal === "SELL") {
        entry = lastPrice - spread;
        sl = entry + atrVals.at(-1)! * CONFIG.ATR_SL_MULTIPLIER;
        tp = entry - (sl - entry) * CONFIG.RISK_REWARD;
    }

    const rr = entry && sl && tp ? Math.abs(tp - entry) / Math.abs(entry - sl) : null;

    return {
        pair,
        signal,
        confidence,
        entry: entry ? Number(entry.toFixed(5)) : null,
        stop_loss: sl ? Number(sl.toFixed(5)) : null,
        take_profit: tp ? Number(tp.toFixed(5)) : null,
        risk_reward: rr ? Number(rr.toFixed(2)) : null,
        spread,
        trend_timeframe: trendTrend.toUpperCase(),
        entry_timeframe: entryTrend.toUpperCase(),
        trend: entryTrend,
        momentum: rsiLast > 50 ? "positive" : "negative",
        volatility,
        timestamp: new Date().toISOString()
    };
}