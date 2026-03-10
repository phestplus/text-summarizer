// professionalSignalEngine.ts
import { ENV } from "@/configs/env";

import axios from "axios";

interface SignalResult {
    pair: string;
    signal: "BUY" | "SELL" | "HOLD";
    confidence: number;
    entry: number;
    stop_loss: number | null;
    take_profit: number | null;
    risk_reward: number | null;
    trend_timeframe: string;
    entry_timeframe: string;
    trend: string;
    momentum: string;
    volatility: string;
    timestamp: string;
}

interface Candle {
    datetime: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

const DEFAULTS = {
    EMA_FAST: 9,
    EMA_SLOW: 21,
    RSI_PERIOD: 14,
    ATR_PERIOD: 14,
    RSI_OVERBOUGHT: 70,
    RSI_OVERSOLD: 30,
    ATR_SL_MULTIPLIER: 1.5,
    RISK_REWARD: 2.0,
    MIN_DATA: 20
};

function ema(series: number[], period: number): number[] {
    const result: number[] = [];
    const k = 2 / (period + 1);
    series.forEach((val, i) => {
        if (i === 0) result.push(val);
        else result.push(val * k + result[i - 1] * (1 - k));
    });
    return result;
}

function rsi(series: number[], period: number): number[] {
    const result: number[] = [];
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < series.length; i++) {
        const delta = series[i] - series[i - 1];
        gains += Math.max(delta, 0);
        losses += Math.max(-delta, 0);
        if (i >= period) {
            const avgGain = gains / period;
            const avgLoss = losses / period;
            const rs = avgGain / (avgLoss || 1);
            result.push(100 - 100 / (1 + rs));
            const deltaOld = series[i - period + 1] - series[i - period];
            gains -= Math.max(deltaOld, 0);
            losses -= Math.max(-deltaOld, 0);
        }
    }
    while (result.length < series.length) result.unshift(50); // fallback
    return result;
}

function atr(candles: Candle[], period: number): number[] {
    const result: number[] = [];
    const tr: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const hl = candles[i].high - candles[i].low;
        const hc = Math.abs(candles[i].high - candles[i - 1].close);
        const lc = Math.abs(candles[i].low - candles[i - 1].close);
        tr.push(Math.max(hl, hc, lc));
    }
    for (let i = 0; i < tr.length; i++) {
        if (i < period) result.push(tr[i]);
        else {
            const avg =
                tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) /
                period;
            result.push(avg);
        }
    }
    while (result.length < candles.length) result.unshift(tr[0] || 0);
    return result;
}

async function fetchCandles(
    symbol: string,
    interval: string,
    outputsize: number,
    apikey: string
): Promise<Candle[]> {
    const url = `https://api.twelvedata.com/time_series`;
    const { data } = await axios.get(url, {
        params: { symbol, interval, outputsize, apikey }
    });
    if (!data.values) throw new Error(data.message || "Error fetching data");
    return data.values
        .map((c: any) => ({
            datetime: c.datetime,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
        }))
        .reverse(); // oldest first
}

function analyzeTrend(candles: Candle[]) {
    const closes = candles.map(c => c.close);
    const emaFast = ema(closes, DEFAULTS.EMA_FAST);
    const emaSlow = ema(closes, DEFAULTS.EMA_SLOW);
    const rsiValues = rsi(closes, DEFAULTS.RSI_PERIOD);
    const atrValues = atr(candles, DEFAULTS.ATR_PERIOD);

    const last = candles[candles.length - 1];
    const trend =
        emaFast[emaFast.length - 1] > emaSlow[emaSlow.length - 1]
            ? "bullish"
            : emaFast[emaFast.length - 1] < emaSlow[emaSlow.length - 1]
            ? "bearish"
            : "neutral";

    let momentum = trend === "bullish" ? "positive" : "negative";
    if (rsiValues[rsiValues.length - 1] > DEFAULTS.RSI_OVERBOUGHT)
        momentum = "overbought";
    if (rsiValues[rsiValues.length - 1] < DEFAULTS.RSI_OVERSOLD)
        momentum = "oversold";

    const atrMean =
        atrValues.slice(-DEFAULTS.ATR_PERIOD).reduce((a, b) => a + b, 0) /
        DEFAULTS.ATR_PERIOD;
    let volatility: string = "normal";
    if (atrValues[atrValues.length - 1] > atrMean * 1.2) volatility = "high";
    else if (atrValues[atrValues.length - 1] < atrMean * 0.8)
        volatility = "low";

    return {
        last,
        trend,
        momentum,
        volatility,
        emaFast,
        emaSlow,
        rsiValues,
        atrValues
    };
}

export async function generateSignal(
    pair: string,
    interval: string = "5min",
    trendInterval: string = "1h"
): Promise<SignalResult> {
    console.log(pair, interval, trendInterval);
    const entryCandles = await fetchCandles(
        pair,
        interval,
        100,
        ENV.TWELVE_DATA_API_KEY
    );
    const trendCandles = await fetchCandles(
        pair,
        trendInterval,
        100,
        ENV.TWELVE_DATA_API_KEY
    );

    const entryAnalysis = analyzeTrend(entryCandles);
    const trendAnalysis = analyzeTrend(trendCandles);

    const entryPrice = entryAnalysis.last.close;
    const atrValue =
        entryAnalysis.atrValues[entryAnalysis.atrValues.length - 1];

    // Determine signal
    let signal: "BUY" | "SELL" | "HOLD" = "HOLD";
    if (entryAnalysis.trend === "bullish" && trendAnalysis.trend === "bullish")
        signal = "BUY";
    else if (
        entryAnalysis.trend === "bearish" &&
        trendAnalysis.trend === "bearish"
    )
        signal = "SELL";

    // Stop loss / take profit
    let sl: number | null = null;
    let tp: number | null = null;
    let rr: number | null = null;

    if (signal === "BUY") {
        sl = entryPrice - atrValue * DEFAULTS.ATR_SL_MULTIPLIER;
        rr = entryPrice - sl;
        tp = entryPrice + rr * DEFAULTS.RISK_REWARD;
    } else if (signal === "SELL") {
        sl = entryPrice + atrValue * DEFAULTS.ATR_SL_MULTIPLIER;
        rr = sl - entryPrice;
        tp = entryPrice - rr * DEFAULTS.RISK_REWARD;
    }

    // Confidence
    let confidence = 50;
    if (entryAnalysis.trend === trendAnalysis.trend) confidence += 30;
    const emaGap = Math.abs(
        entryAnalysis.emaFast[entryAnalysis.emaFast.length - 1] -
            entryAnalysis.emaSlow[entryAnalysis.emaSlow.length - 1]
    );
    confidence += Math.min(emaGap * 1000, 20);
    confidence = Math.min(confidence, 100);

    return {
        pair,
        signal,
        confidence: Math.round(confidence),
        entry: parseFloat(entryPrice.toFixed(5)),
        stop_loss: sl ? parseFloat(sl.toFixed(5)) : null,
        take_profit: tp ? parseFloat(tp.toFixed(5)) : null,
        risk_reward: rr && tp && sl ? parseFloat((tp / sl).toFixed(2)) : null,
        trend_timeframe: trendAnalysis.trend.toUpperCase(),
        entry_timeframe: entryAnalysis.trend.toUpperCase(),
        trend: entryAnalysis.trend,
        momentum: entryAnalysis.momentum,
        volatility: entryAnalysis.volatility,
        timestamp: new Date().toISOString()
    };
}

// ===================
// Example Usage
// ===================

// (async () => {
//   const result = await generateSignal("EUR/USD", "5min", "1h", "your_api_key_here");
//   console.log(result);
// })();
