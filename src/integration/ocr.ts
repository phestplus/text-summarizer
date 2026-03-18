import fs from "fs";export function normalizeSymbol(symbol: string) {
    symbol = symbol.replace(/\//g, ""); // remove any existing slashes

    const knownQuotes = [
        "USDT", "USDC", "USD", "BTC", "ETH", 
        "EUR", "JPY", "GBP", "AUD", "CAD", "CHF", "NZD"
    ];

    for (const quote of knownQuotes) {
        if (symbol.endsWith(quote)) {
            const base = symbol.slice(0, symbol.length - quote.length);
            return `${base}/${quote}`;
        }
    }

    return symbol; // fallback
}


export function formatSignalMarkdown(signal: Record<string, any>) {
    const formatted: string[] = [];

    // Title
    formatted.push("📊 *Trade Signal Generated* 📊\n");

    // Key icons (stay the same)
    const keyIcons: Record<string, string> = {
    pair: "💱",
    signal: "📡",
    confidence: "📈",
    entry: "🎯",
    stop_loss: "🛑",
    take_profit: "💰",
    risk_reward: "⚖️",
    trend_timeframe: "⏱️",
    entry_timeframe: "⏱️",
    trend: "📊",
    momentum: "💨",
    volatility: "🌪️",
    lot_size: "📦",
    risk_amount: "💸",
    spread: "↔️",
    timestamp: "⏰"
};

    for (const [key, value] of Object.entries(signal)) {
        const displayKey = key
            .split("_")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

        let displayValue = value;
        let frontIcon = ""; // icon in front of value, new layer

        // New icons for specific values
        if (key === "signal") {
            if (value.toUpperCase() === "BUY") frontIcon = "⬆️"; // green arrow up
            else if (value.toUpperCase() === "SELL") frontIcon = "⬇️"; // red arrow down
        }

        if (key === "confidence") {
            if (value >= 81) frontIcon = "🟢"; // high confidence
            else if (value >= 51) frontIcon = "🟠"; // medium
            else frontIcon = "🔴"; // low
        }

        if (key === "volume") {
            frontIcon = "🔊"; // volume icon
        }

        // Convert timestamp to readable local date
        if (key === "timestamp") {
            const date = new Date(value);
            displayValue = date.toLocaleString(undefined, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            });
        }

        // Final line: bold key (with existing icon), then front icon + value
        const keyIcon = keyIcons[key] ? `${keyIcons[key]} ` : "";
        formatted.push(`${keyIcon}*${displayKey}:*   ${frontIcon} ${displayValue}`);
    }

    return formatted.join("\n\n");
}
