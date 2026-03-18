import axios from "axios";
import { ENV } from "@/configs/env";

// ------------------------ Types ------------------------

export interface Candle {
    datetime: string;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface SignalResult {
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
    lot_size?: number;
    risk_amount?: number;
}

// ------------------------ Config ------------------------

const CONFIG = {
    EMA_FAST: 9,
    EMA_SLOW: 21,
    RSI_PERIOD: 14,
    ATR_PERIOD: 14,
    ATR_SL_MULTIPLIER: 1.5,
    RISK_REWARD: 2,
    MIN_CANDLES: 120,
    RSI_OVERBOUGHT: 70,
    RSI_OVERSOLD: 30,
    DEFAULT_SPREAD: 0.0001 // fallback spread
};

// ------------------------ Indicators ------------------------

function ema(values: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const result: number[] = [];
    values.forEach((v, i) => {
        if (i === 0) result.push(v);
        else result.push(v * k + result[i - 1] * (1 - k));
    });
    return result;
}

function rsi(values: number[], period: number): number[] {
    const result: number[] = [];
    let gain = 0,
        loss = 0;

    for (let i = 1; i <= period; i++) {
        const diff = values[i] - values[i - 1];
        if (diff >= 0) gain += diff;
        else loss -= diff;
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

function atr(candles: Candle[], period: number): number[] {
    const tr: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high;
        const l = candles[i].low;
        const pc = candles[i - 1].close;
        tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }

    const result: number[] = [];
    let first = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result[period] = first;

    for (let i = period + 1; i < tr.length; i++) {
        result[i] = (result[i - 1] * (period - 1) + tr[i]) / period;
    }

    return result;
}

// ------------------------ Utilities ------------------------

async function fetchCandles(symbol: string, interval: string): Promise<Candle[]> {
    const { data } = await axios.get("https://api.twelvedata.com/time_series", {
        params: {
            symbol,
            interval,
            outputsize: CONFIG.MIN_CANDLES,
            apikey: ENV.TWELVE_DATA_API_KEY
        }
    });

    if (!data.values) throw new Error("Market data unavailable");

    const candles: Candle[] = data.values
        .map((c: any) => ({
            datetime: c.datetime,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close)
        }))
        .reverse();

    if (candles.length < CONFIG.MIN_CANDLES)
        throw new Error("Insufficient market data");

    return candles;
}

function classifyVolatility(atrValues: number[]): "low" | "normal" | "high" {
    const recent = atrValues.at(-1)!;
    const avg = atrValues.slice(-CONFIG.ATR_PERIOD).reduce((a, b) => a + b, 0) / CONFIG.ATR_PERIOD;

    if (recent > avg * 1.25) return "high";
    if (recent < avg * 0.75) return "low";
    return "normal";
}

function calculateSLTP(entry: number, atrLast: number, signal: "BUY" | "SELL") {
    let sl: number, tp: number;

    if (signal === "BUY") {
        sl = entry - atrLast * CONFIG.ATR_SL_MULTIPLIER;
        tp = entry + (entry - sl) * CONFIG.RISK_REWARD;
    } else {
        sl = entry + atrLast * CONFIG.ATR_SL_MULTIPLIER;
        tp = entry - (sl - entry) * CONFIG.RISK_REWARD;
    }

    return { sl, tp };
}

// ------------------------ Signal Engine ------------------------

export async function generateSignal(
    pair: string,
    entryTF = "5min",
    capital = 10
): Promise<SignalResult> {
    const actualSpread = CONFIG.DEFAULT_SPREAD;

    const entryCandles = await fetchCandles(pair, entryTF);
    const entryCloses = entryCandles.map(c => c.close);

    const fastEMA = ema(entryCloses, CONFIG.EMA_FAST);
    const slowEMA = ema(entryCloses, CONFIG.EMA_SLOW);
    const rsiVals = rsi(entryCloses, CONFIG.RSI_PERIOD);
    const atrVals = atr(entryCandles, CONFIG.ATR_PERIOD);

    const lastPrice = entryCloses.at(-1)!;
    const trend = fastEMA.at(-1)! > slowEMA.at(-1)! ? "bullish" : "bearish";

    let baseSignal: "BUY" | "SELL" | "HOLD" = "HOLD";
    if (trend === "bullish") baseSignal = "BUY";
    if (trend === "bearish") baseSignal = "SELL";

    let entry: number | null = null;
    let sl: number | null = null;
    let tp: number | null = null;

    if (baseSignal === "BUY") entry = lastPrice + actualSpread;
    if (baseSignal === "SELL") entry = lastPrice - actualSpread;

    if (entry !== null && baseSignal !== "HOLD") {
        ({ sl, tp } = calculateSLTP(entry, atrVals.at(-1)!, baseSignal));
    }

    const rr = entry !== null && sl !== null && tp !== null
        ? Math.abs(tp - entry) / Math.abs(entry - sl)
        : null;

    // Confidence
    let confidence = 50;
    if (trend === (baseSignal === "BUY" ? "bullish" : "bearish")) confidence += 25;
    const rsiLast = rsiVals.at(-1)!;
    if (rsiLast > 50 && baseSignal === "BUY") confidence += 10;
    if (rsiLast < 50 && baseSignal === "SELL") confidence += 10;
    const volatility = classifyVolatility(atrVals);
    if (volatility === "normal") confidence += 10;

    // ---------------- Capital-aware lot size ----------------
    const pipValuePerStandardLot = 10; // $10 per 1 pip standard lot
    const riskPercentOfCapital = 0.02;
    const maxRiskPercent = 0.3;
    const riskAmount = Math.min(capital * riskPercentOfCapital, capital * maxRiskPercent);

    const lotSize = entry && sl
        ? riskAmount / (Math.abs(entry - sl) * 10000 * pipValuePerStandardLot)
        : 0.01;

    const finalLotSize = Math.max(0.001, lotSize);

    return {
        pair,
        signal: confidence >= 60 ? baseSignal : "HOLD",
        confidence,
        entry: entry !== null ? Number(entry.toFixed(5)) : null,
        stop_loss: sl !== null ? Number(sl.toFixed(5)) : null,
        take_profit: tp !== null ? Number(tp.toFixed(5)) : null,
        risk_reward: rr !== null ? Number(rr.toFixed(2)) : null,
        lot_size: Number(finalLotSize.toFixed(4)),
        risk_amount: Number(riskAmount.toFixed(2)),
        spread: actualSpread,
        trend_timeframe: entryTF.toUpperCase(),
        entry_timeframe: entryTF.toUpperCase(),
        trend,
        momentum: rsiLast > 50 ? "positive" : "negative",
        volatility,
        timestamp: new Date().toISOString()
    };
}