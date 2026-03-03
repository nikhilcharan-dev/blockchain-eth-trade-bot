"use client";

import { useEffect, useState, useCallback } from "react";
import { Line } from "react-chartjs-2";
import {
    Chart as ChartJS,
    LineElement,
    CategoryScale,
    LinearScale,
    PointElement,
    Tooltip,
    Legend,
    Filler,
} from "chart.js";
import { useCurrency } from "@/context/CurrencyContext";
import "./styles.css";

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler);

const WAZIRX_KLINES_URL = "https://api.wazirx.com/sapi/v1/klines";
const WAZIRX_TICKER_URL = "https://api.wazirx.com/sapi/v1/ticker/24hr";

const tokenList = [
    "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT",
    "AVAX", "TRX", "LINK", "MATIC", "SHIB", "LTC", "UNI",
];

const TIMEFRAMES = [
    { label: "1D", interval: "15m", ms: 24 * 60 * 60 * 1000 },
    { label: "1W", interval: "1h", ms: 7 * 24 * 60 * 60 * 1000 },
    { label: "1M", interval: "4h", ms: 30 * 24 * 60 * 60 * 1000 },
    { label: "3M", interval: "1d", ms: 90 * 24 * 60 * 60 * 1000 },
    { label: "1Y", interval: "1d", ms: 365 * 24 * 60 * 60 * 1000 },
];

function formatLabel(timestamp, tfLabel) {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return "";
    if (tfLabel === "1D") {
        return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    if (tfLabel === "1W") {
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " +
            d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    if (tfLabel === "1M" || tfLabel === "3M") {
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    }
    return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function OrbitLoader() {
    return (
        <div className="chart-loader">
            <div className="orbit-loader">
                <span /><span /><span /><span />
            </div>
            <div className="chart-loader-text">Loading chart data...</div>
        </div>
    );
}

export default function MultiChart() {
    const { convert, currencySymbol, currency, wazirxPrices } = useCurrency();

    const [token, setToken] = useState("BTC");
    const [timeframe, setTimeframe] = useState(TIMEFRAMES[0]);
    const [prices, setPrices] = useState([]);
    const [times, setTimes] = useState([]);
    const [loading, setLoading] = useState(true);

    const [baseline, setBaseline] = useState("");
    const baselineValue = parseFloat(baseline) || null;
    const symbol = token.toLowerCase() + "inr";

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const now = Date.now();
            const startTime = now - timeframe.ms;
            const r = await fetch(
                `${WAZIRX_KLINES_URL}?symbol=${symbol}&interval=${timeframe.interval}&startTime=${startTime}&endTime=${now}&limit=500`,
                { cache: "no-store" }
            );
            if (!r.ok) return;
            const data = await r.json();
            if (Array.isArray(data) && data.length > 0) {
                const normalized = data
                    .map((k) => ({ close: parseFloat(k[4]), openTime: Number(k[0]) }))
                    .filter((k) => Number.isFinite(k.close) && Number.isFinite(k.openTime))
                    .sort((a, b) => a.openTime - b.openTime);
                if (normalized.length > 0) {
                    setPrices(normalized.map((k) => k.close));
                    setTimes(normalized.map((k) => k.openTime));
                    return;
                }
            }

            const tickerResp = await fetch(`${WAZIRX_TICKER_URL}?symbol=${symbol}`, { cache: "no-store" });
            if (tickerResp.ok) {
                const t = await tickerResp.json();
                const fallbackPrice = parseFloat(t.lastPrice ?? t.last ?? t.openPrice);
                if (Number.isFinite(fallbackPrice)) {
                    const points = Array.from({ length: 12 }, (_, i) => now - (11 - i) * 5 * 60 * 1000);
                    setPrices(Array(12).fill(fallbackPrice));
                    setTimes(points);
                }
            }
        } catch (err) {
            console.error("Klines fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [symbol, timeframe]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    useEffect(() => {
        const iv = setInterval(fetchHistory, 30000);
        return () => clearInterval(iv);
    }, [fetchHistory]);

    const refreshNow = () => fetchHistory();

    const displayPrices = prices.map((p) => convert(p));
    const displayLabels = times.map((t) => formatLabel(t, timeframe.label));

    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1] ?? wazirxPrices[token]?.priceInr;
    const priceChange = firstPrice && lastPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
    const isPositive = priceChange >= 0;

    const makeBaseline = (v, length) => (v ? Array(length).fill(v) : []);

    return (
        <div className="multi-chart-wrapper">
            <div className="multi-chart-header">
                <div className="main-chart-title-row">
                    <h2>{token} Price Chart ({currency})</h2>
                    <span className="wazirx-badge">WazirX</span>
                    <button className="mini-refresh-btn" onClick={refreshNow}>Refresh</button>
                </div>

                <div className="chart-price-row">
                    {Number.isFinite(lastPrice) && (
                        <span className="chart-live-price">
                            {currencySymbol}{convert(lastPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    )}
                    {prices.length > 0 && (
                        <span className={`chart-price-change ${isPositive ? "chart-change-up" : "chart-change-down"}`}>
                            {isPositive ? "+" : ""}{priceChange.toFixed(2)}%
                        </span>
                    )}
                </div>

                <div className="multi-chart-controls">
                    <select
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className="multi-chart-select"
                    >
                        {tokenList.map((t) => (
                            <option key={t} value={t}>{t}/INR</option>
                        ))}
                    </select>

                    <div className="chart-timeframe-bar">
                        {TIMEFRAMES.map((tf) => (
                            <button
                                key={tf.label}
                                className={`chart-tf-btn ${timeframe.label === tf.label ? "chart-tf-active" : ""}`}
                                onClick={() => setTimeframe(tf)}
                            >
                                {tf.label}
                            </button>
                        ))}
                    </div>

                    <input
                        type="number"
                        placeholder={`Set baseline price (${currency})...`}
                        value={baseline}
                        onChange={(e) => setBaseline(e.target.value)}
                        className="multi-chart-input"
                    />
                </div>
            </div>

            <div style={{ height: "350px", position: "relative" }}>
                {loading && displayPrices.length === 0 && <OrbitLoader />}
                <Line
                    data={{
                        labels: displayLabels,
                        datasets: [
                            {
                                label: `${token}/${currency}`,
                                data: displayPrices,
                                borderColor: isPositive ? "#00e676" : "#ff5252",
                                backgroundColor: isPositive
                                    ? "rgba(0, 230, 118, 0.08)"
                                    : "rgba(255, 82, 82, 0.08)",
                                tension: 0.3,
                                fill: true,
                                pointRadius: 0,
                                pointHoverRadius: 4,
                                borderWidth: 2,
                            },
                            ...(baselineValue
                                ? [{
                                    label: `Baseline (${currencySymbol}${baselineValue})`,
                                    data: makeBaseline(baselineValue, displayPrices.length),
                                    borderColor: "rgba(255, 255, 255, 0.3)",
                                    borderDash: [6, 6],
                                    tension: 0,
                                    pointRadius: 0,
                                }]
                                : []),
                        ],
                    }}
                    options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: "index", intersect: false },
                        scales: {
                            x: {
                                ticks: {
                                    color: "rgba(255,255,255,0.3)",
                                    autoSkip: true,
                                    maxTicksLimit: 8,
                                    maxRotation: 0,
                                },
                                grid: { color: "rgba(255,255,255,0.04)" },
                            },
                            y: {
                                position: "right",
                                ticks: { color: "rgba(255,255,255,0.3)" },
                                grid: { color: "rgba(255,255,255,0.04)" },
                            },
                        },
                        plugins: {
                            legend: {
                                labels: { color: "rgba(255,255,255,0.6)" },
                            },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => `${ctx.dataset.label}: ${currencySymbol}${ctx.parsed.y.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                },
                            },
                        },
                    }}
                />
            </div>
        </div>
    );
}
