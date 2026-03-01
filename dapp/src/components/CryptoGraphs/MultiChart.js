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
import './styles.css';

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler);

const WAZIRX_KLINES_URL = "https://api.wazirx.com/sapi/v1/klines";

const tokenList = [
    "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT",
    "AVAX", "TRX", "LINK", "MATIC", "SHIB", "LTC", "UNI",
];

const TIMEFRAMES = [
    { label: "1D",  interval: "15m", limit: 96  },
    { label: "1W",  interval: "1h",  limit: 168 },
    { label: "1M",  interval: "4h",  limit: 180 },
    { label: "3M",  interval: "1d",  limit: 90  },
    { label: "1Y",  interval: "1d",  limit: 365 },
];

function formatLabel(timestamp, tfLabel) {
    const d = new Date(timestamp);
    if (tfLabel === "1D") {
        return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    }
    if (tfLabel === "1W") {
        return d.toLocaleDateString("en-IN", { weekday: "short", hour: "2-digit", minute: "2-digit" });
    }
    if (tfLabel === "1M") {
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    }
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function MultiChart() {
    const { convert, currencySymbol, currency } = useCurrency();

    const [token, setToken] = useState("BTC");
    const [timeframe, setTimeframe] = useState(TIMEFRAMES[0]);
    const [prices, setPrices] = useState([]);
    const [times, setTimes] = useState([]);
    const [loading, setLoading] = useState(true);

    const [baseline, setBaseline] = useState("");
    const baselineValue = parseFloat(baseline) || null;

    // Fetch historical kline data
    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const symbol = token.toLowerCase() + "inr";
            const r = await fetch(
                `${WAZIRX_KLINES_URL}?symbol=${symbol}&interval=${timeframe.interval}&limit=${timeframe.limit}`
            );
            if (!r.ok) return;
            const data = await r.json();
            if (Array.isArray(data) && data.length > 0) {
                setPrices(data.map(k => parseFloat(k[4]))); // close price
                setTimes(data.map(k => k[0])); // timestamp
            }
        } catch (err) {
            console.error("Klines fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [token, timeframe]);

    useEffect(() => { fetchHistory(); }, [fetchHistory]);

    // Auto-refresh every 30s
    useEffect(() => {
        const iv = setInterval(fetchHistory, 30000);
        return () => clearInterval(iv);
    }, [fetchHistory]);

    // Convert to display currency
    const displayPrices = prices.map((p) => convert(p));
    const displayLabels = times.map((t) => formatLabel(t, timeframe.label));

    // Price change
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const priceChange = firstPrice && lastPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
    const isPositive = priceChange >= 0;

    const makeBaseline = (v, length) => (v ? Array(length).fill(v) : []);

    return (
        <div className="multi-chart-wrapper">
            <div className="multi-chart-header">
                <div className="main-chart-title-row">
                    <h2>{token} Price Chart ({currency})</h2>
                    <span className="wazirx-badge">WazirX</span>
                </div>

                {/* Live price + change */}
                <div className="chart-price-row">
                    {lastPrice && (
                        <span className="chart-live-price">
                            {currencySymbol}{convert(lastPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    )}
                    <span className={`chart-price-change ${isPositive ? "chart-change-up" : "chart-change-down"}`}>
                        {isPositive ? "+" : ""}{priceChange.toFixed(2)}%
                    </span>
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

                    {/* Timeframe buttons */}
                    <div className="chart-timeframe-bar">
                        {TIMEFRAMES.map(tf => (
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
                {loading && displayPrices.length === 0 && (
                    <div className="candlestick-loading">Loading...</div>
                )}
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
                        interaction: {
                            mode: "index",
                            intersect: false,
                        },
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
