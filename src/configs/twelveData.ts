import { connection } from "@/queue/redis";
import axios from "axios";
import { TradeData } from "./ai";
import { ENV } from "./env";

export async function getMarketData(
    symbol: string,
    interval: string
): Promise<TradeData[]> {
    const cacheKey = `twelve_data_${symbol}_${interval}`;
    const cachedData = await connection.get(cacheKey);
    if (cachedData) {
        const data = JSON.parse(cachedData);
        return data;
    }

    // Calculate last 5 days
    const now = new Date();
    const endDate = now.toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS
    const startDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19);

    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&start_date=${startDate}&end_date=${endDate}&apikey=${ENV.TWELVE_DATA_API_KEY}`;

    const res = await axios.get(url);

    // Cache the data
    connection.setex(
        cacheKey,
        timeframeToSeconds(interval) * 5 * 24, // cache roughly 5 days for this interval
        JSON.stringify(res.data.values, null, 2)
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
        w: 60 * 60 * 24 * 7
    };

    return value * unitMap[unit];
}