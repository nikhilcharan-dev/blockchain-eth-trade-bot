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
const WAZIRX_TICKER_URL = "https://api.wazirx.com/sapi/v1/ticker/24hr";

const TIMEFRAMES = [
    { label: "1D",  interval: "15m", ms: 24 * 60 * 60 * 1000 },
    { label: "1W",  interval: "1h",  ms: 7 * 24 * 60 * 60 * 1000 },
    { label: "1M",  interval: "4h",  ms: 30 * 24 * 60 * 60 * 1000 },
    { label: "3M",  interval: "1d",  ms: 90 * 24 * 60 * 60 * 1000 },
    { label: "1Y",  interval: "1d",  ms: 365 * 24 * 60 * 60 * 1000 },
];

function formatLabel(timestamp, tfLabel) {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return "";
    if (tfLabel === "1D") {
        return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    if (tfLabel === "1W") {
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " +
            d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    if (tfLabel === "1M") {
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    }
    if (tfLabel === "3M") {
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    }
    return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function PulseWaveLoader() {
    return (
        <div className="chart-loader">
            <div className="pulse-wave">
                <span /><span /><span /><span /><span /><span /><span />
            </div>
            <div className="chart-loader-text">Fetching market data...</div>
        </div>
    );
}

export default function MainChart() {
    const { convert, currencySymbol, currency } = useCurrency();

    const [timeframe, setTimeframe] = useState(TIMEFRAMES[0]);
    const [prices, setPrices] = useState([]);
    const [times, setTimes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [livePrice, setLivePrice] = useState(null);

    // Fetch historical kline data with explicit startTime
    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const now = Date.now();
            const startTime = now - timeframe.ms;
            const r = await fetch(
                `${WAZIRX_KLINES_URL}?symbol=ethinr&interval=${timeframe.interval}&startTime=${startTime}&endTime=${now}&limit=500`
            );
            if (!r.ok) return;
            const data = await r.json();
            if (Array.isArray(data) && data.length > 0) {
                setPrices(data.map(k => parseFloat(k[4])));
                setTimes(data.map(k => k[0]));
            }
        } catch (err) {
            console.error("Klines fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [timeframe]);

    useEffect(() => { fetchHistory(); }, [fetchHistory]);

    useEffect(() => {
        const iv = setInterval(fetchHistory, 30000);
        return () => clearInterval(iv);
    }, [fetchHistory]);

    // Poll live price every 3s
    useEffect(() => {
        const fetchLive = async () => {
            try {
                const resp = await fetch(`${WAZIRX_TICKER_URL}?symbol=ethinr`);
                if (!resp.ok) return;
                const data = await resp.json();
                setLivePrice(parseFloat(data.lastPrice));
            } catch {}
        };
        fetchLive();
        const iv = setInterval(fetchLive, 3000);
        return () => clearInterval(iv);
    }, []);

    // BUY POINTS
    const [buyPoints, setBuyPoints] = useState([]);
    const [newBuyName, setNewBuyName] = useState("");
    const [newBuyPrice, setNewBuyPrice] = useState("");

    const addBuy = () => {
        if (!newBuyName || !newBuyPrice) return;
        const price = parseFloat(newBuyPrice);
        if (isNaN(price)) return;
        const inrPrice = currency === "INR" ? price : price / convert(1);
        setBuyPoints((prev) => [
            ...prev,
            { id: Date.now(), name: newBuyName, inrPrice },
        ]);
        setNewBuyName("");
        setNewBuyPrice("");
    };

    const deleteBuy = (id) => setBuyPoints((prev) => prev.filter((b) => b.id !== id));

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const displayPrices = prices.map((p) => convert(p));
    const displayLabels = times.map((t) => formatLabel(t, timeframe.label));

    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const priceChange = firstPrice && lastPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
    const isPositive = priceChange >= 0;

    const colors = ["#ff6347", "#ffa500", "#32cd32", "#00bfff", "#8a2be2", "#ff69b4"];
    const buyLineDatasets = buyPoints.map((b, index) => ({
        label: `${b.name} (Buy @ ${convert(b.inrPrice).toFixed(2)} ${currency})`,
        data: Array(displayPrices.length).fill(convert(b.inrPrice)),
        borderColor: colors[index % colors.length],
        borderDash: [6, 6],
        tension: 0,
        pointRadius: 0,
    }));

    return (
        <div className="eth-chart">
            <button
                className="trade-toggle-btn"
                onClick={() => setIsSidebarOpen(p => !p)}
                style={{ right: "10px" }}
            >
                {isSidebarOpen ? "Hide Trades" : "Show Trades"}
            </button>

            <div className="eth-chart-container">
                <div className="main-chart-title-row">
                    <h2>ETH Live Price Chart ({currency})</h2>
                    <span className="wazirx-badge">WazirX</span>
                </div>

                <div className="chart-price-row">
                    {livePrice && (
                        <span className="chart-live-price">
                            {currencySymbol}{convert(livePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    )}
                    {prices.length > 0 && (
                        <span className={`chart-price-change ${isPositive ? "chart-change-up" : "chart-change-down"}`}>
                            {isPositive ? "+" : ""}{priceChange.toFixed(2)}%
                        </span>
                    )}
                </div>

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

                <div style={{ height: "400px", width: "100%", position: "relative" }}>
                    {loading && displayPrices.length === 0 && <PulseWaveLoader />}
                    <Line
                        data={{
                            labels: displayLabels,
                            datasets: [
                                {
                                    label: `ETH/${currency}`,
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
                                ...buyLineDatasets,
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
                                        minRotation: 0,
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
                                    position: "top",
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

            {/* SIDEBAR */}
            <div className="eth-chart-sidebar"
                style={{
                    minWidth: isSidebarOpen ? "280px" : "0px",
                    maxWidth: isSidebarOpen ? "320px" : "0px",
                    padding: isSidebarOpen ? "20px" : "20px 0",
                    border: isSidebarOpen ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}
            >
                {isSidebarOpen && (
                    <>
                        <h3>Add Buy Phase</h3>
                        <input type="text" placeholder="Trade name" value={newBuyName} onChange={(e) => setNewBuyName(e.target.value)} />
                        <input type="number" placeholder={`Buy price in ${currency}`} value={newBuyPrice} onChange={(e) => setNewBuyPrice(e.target.value)} />
                        <button onClick={addBuy}>Add Buy</button>

                        <h3 style={{ marginTop: "20px" }}>Active Trades</h3>
                        <table className="trade-table">
                            <tbody>
                            {buyPoints.map((b, index) => {
                                const buy = convert(b.inrPrice);
                                const current = displayPrices[displayPrices.length - 1] || buy;
                                const pnl = current - buy;
                                const pnlPercent = buy ? (pnl / buy) * 100 : 0;
                                const pnlClass = pnl > 0 ? "pnl-profit" : pnl < 0 ? "pnl-loss" : "pnl-neutral";

                                return (
                                    <tr key={b.id} className="trade-row">
                                        <td className="trade-cell">
                                            <span className="trade-color-dot" style={{ background: colors[index % colors.length] }} />
                                            {b.name}
                                        </td>
                                        <td className="trade-cell">@ {currencySymbol}{buy.toFixed(2)}</td>
                                        <td className={`trade-cell ${pnlClass}`}>
                                            {pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)
                                        </td>
                                        <td className="trade-cell" style={{ textAlign: "right" }}>
                                            <button className="delete-btn" onClick={() => deleteBuy(b.id)}>X</button>
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </>
                )}
            </div>
        </div>
    );
}
