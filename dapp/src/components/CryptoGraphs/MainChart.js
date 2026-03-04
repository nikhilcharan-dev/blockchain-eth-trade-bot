"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
const WAZIRX_DEPTH_URL = "/api/wazirx/depth";
const WAZIRX_WS_URL = "wss://stream.wazirx.com/stream";

const TRADE_SYMBOLS = ["BTC", "ETH", "SOL"];

const TIMEFRAMES = [
    { label: "1D", interval: "15m", ms: 24 * 60 * 60 * 1000 },
    { label: "1W", interval: "1h", ms: 7 * 24 * 60 * 60 * 1000 },
    { label: "1M", interval: "4h", ms: 30 * 24 * 60 * 60 * 1000 },
    { label: "3M", interval: "1d", ms: 90 * 24 * 60 * 60 * 1000 },
    { label: "1Y", interval: "1d", ms: 365 * 24 * 60 * 60 * 1000 },
];

const ANOMALY_COOLDOWN_MS = 45 * 1000;
const SPREAD_WINDOW_MS = 5 * 60 * 1000;

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

function SpreadSparkline({ points }) {
    if (points.length < 2) {
        return <div className="spread-empty">Waiting for spread trend…</div>;
    }

    const width = 220;
    const height = 64;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const d = points
        .map((p, i) => {
            const x = (i / (points.length - 1)) * width;
            const y = height - ((p.value - min) / range) * (height - 8) - 4;
            return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ");

    return (
        <svg className="spread-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="spread trend">
            <path d={d} className="spread-sparkline-line" />
        </svg>
    );
}

export default function MainChart() {
    const { convert, currencySymbol, currency } = useCurrency();

    const [selectedSymbol, setSelectedSymbol] = useState("ETH");
    const [timeframe, setTimeframe] = useState(TIMEFRAMES[0]);
    const [prices, setPrices] = useState([]);
    const [times, setTimes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [livePrice, setLivePrice] = useState(null);
    const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
    const [spreadHistory, setSpreadHistory] = useState([]);
    const [feedMode, setFeedMode] = useState("poll");

    const symbolPair = `${selectedSymbol.toLowerCase()}inr`;
    const symbolStream = `${selectedSymbol.toLowerCase()}inr@ticker`;

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const now = Date.now();
            const startTime = now - timeframe.ms;
            const r = await fetch(`${WAZIRX_KLINES_URL}?symbol=${symbolPair}&interval=${timeframe.interval}&startTime=${startTime}&endTime=${now}&limit=500`, {
                cache: "no-store",
            });
            if (!r.ok) return;
            const data = await r.json();
            if (Array.isArray(data) && data.length > 0) {
                const normalized = data
                    .map((k) => ({ close: parseFloat(k[4]), openTime: Number(k[0]) }))
                    .filter((k) => Number.isFinite(k.close) && Number.isFinite(k.openTime))
                    .sort((a, b) => a.openTime - b.openTime);

                setPrices(normalized.map((k) => k.close));
                setTimes(normalized.map((k) => k.openTime));
            }
        } catch (err) {
            console.error("Klines fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [symbolPair, timeframe]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    useEffect(() => {
        const iv = setInterval(fetchHistory, 30000);
        return () => clearInterval(iv);
    }, [fetchHistory]);

    useEffect(() => {
        const fetchLive = async () => {
            try {
                const resp = await fetch(`${WAZIRX_TICKER_URL}?symbol=${symbolPair}`, { cache: "no-store" });
                if (!resp.ok) return;
                const data = await resp.json();
                const parsedPrice = parseFloat(data.lastPrice ?? data.last ?? data.openPrice);
                if (Number.isFinite(parsedPrice)) {
                    setLivePrice(parsedPrice);
                }
            } catch (err) {
                console.error("Live price fetch error:", err);
            }
        };

        fetchLive();
        const iv = setInterval(fetchLive, 3000);
        return () => clearInterval(iv);
    }, [symbolPair]);

    useEffect(() => {
        const fetchOrderBook = async () => {
            try {
                const resp = await fetch(`${WAZIRX_DEPTH_URL}?symbol=${symbolPair}&limit=30`, { cache: "no-store" });
                if (!resp.ok) return;
                const data = await resp.json();

                const toLevel = (level) => {
                    if (!Array.isArray(level) || level.length < 2) return null;
                    const price = parseFloat(level[0]);
                    const qty = parseFloat(level[1]);
                    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
                    return { price, qty };
                };

                const bids = Array.isArray(data.bids)
                    ? data.bids
                        .map(toLevel)
                        .filter(Boolean)
                        .sort((a, b) => b.price - a.price)
                        .slice(0, 12)
                    : [];
                const asks = Array.isArray(data.asks)
                    ? data.asks
                        .map(toLevel)
                        .filter(Boolean)
                        .sort((a, b) => a.price - b.price)
                        .slice(0, 12)
                    : [];

                setOrderBook({ bids, asks });
                setFeedMode((current) => (current === "ws" ? current : "poll"));
            } catch (err) {
                console.error("Order book fetch error:", err);
            }
        };

        fetchOrderBook();
        const iv = setInterval(fetchOrderBook, 3000);
        return () => clearInterval(iv);
    }, [symbolPair]);

    useEffect(() => {
        let ws;
        let closedByCleanup = false;

        const connectWs = () => {
            try {
                ws = new WebSocket(WAZIRX_WS_URL);
                ws.onopen = () => {
                    ws.send(JSON.stringify({ event: "subscribe", streams: [symbolStream] }));
                    setFeedMode("ws");
                };
                ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        const candidate = parseFloat(message?.data?.lastPrice ?? message?.data?.last ?? message?.lastPrice ?? message?.last);
                        if (Number.isFinite(candidate)) {
                            setLivePrice(candidate);
                        }
                    } catch {
                        // ignore malformed payloads
                    }
                };
                ws.onerror = () => {
                    setFeedMode("poll");
                };
                ws.onclose = () => {
                    setFeedMode("poll");
                    if (!closedByCleanup) {
                        setTimeout(connectWs, 2000);
                    }
                };
            } catch {
                setFeedMode("poll");
            }
        };

        connectWs();
        return () => {
            closedByCleanup = true;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, [symbolStream]);

    const [buyPoints, setBuyPoints] = useState([]);
    const [newBuyName, setNewBuyName] = useState("");
    const [newBuyPrice, setNewBuyPrice] = useState("");

    const addBuy = () => {
        if (!newBuyName || !newBuyPrice) return;
        const price = parseFloat(newBuyPrice);
        if (Number.isNaN(price) || price <= 0) return;
        const convRate = convert(1);
        const inrPrice = currency === "INR" ? price : (convRate > 0 ? price / convRate : price);
        setBuyPoints((prev) => [
            ...prev,
            { id: Date.now(), symbol: selectedSymbol, name: newBuyName, inrPrice },
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
    const buyLineDatasets = buyPoints
        .filter((b) => b.symbol === selectedSymbol)
        .map((b, index) => ({
            label: `${b.name} (Buy @ ${convert(b.inrPrice).toFixed(2)} ${currency})`,
            data: Array(displayPrices.length).fill(convert(b.inrPrice)),
            borderColor: colors[index % colors.length],
            borderDash: [6, 6],
            tension: 0,
            pointRadius: 0,
        }));

    const topBid = orderBook.bids[0]?.price;
    const topAsk = orderBook.asks[0]?.price;
    const spread = Number.isFinite(topBid) && Number.isFinite(topAsk) ? topAsk - topBid : null;

    const bidDepthTotal = useMemo(() => orderBook.bids.reduce((sum, row) => sum + row.qty, 0), [orderBook.bids]);
    const askDepthTotal = useMemo(() => orderBook.asks.reduce((sum, row) => sum + row.qty, 0), [orderBook.asks]);
    const depthTotal = bidDepthTotal + askDepthTotal;
    const bidRatio = depthTotal > 0 ? (bidDepthTotal / depthTotal) * 100 : 0;

    const bidVWAP = useMemo(() => {
        const notional = orderBook.bids.reduce((sum, row) => sum + row.price * row.qty, 0);
        return bidDepthTotal > 0 ? notional / bidDepthTotal : null;
    }, [orderBook.bids, bidDepthTotal]);

    const askVWAP = useMemo(() => {
        const notional = orderBook.asks.reduce((sum, row) => sum + row.price * row.qty, 0);
        return askDepthTotal > 0 ? notional / askDepthTotal : null;
    }, [orderBook.asks, askDepthTotal]);

    const depthLadder = useMemo(() => {
        const asks = [];
        let askCum = 0;
        for (const row of orderBook.asks) {
            askCum += row.qty;
            asks.push({ ...row, cumQty: askCum });
        }

        const bids = [];
        let bidCum = 0;
        for (const row of orderBook.bids) {
            bidCum += row.qty;
            bids.push({ ...row, cumQty: bidCum });
        }

        return { asks, bids };
    }, [orderBook]);

    useEffect(() => {
        if (spread === null) return;
        const now = Date.now();
        setSpreadHistory((prev) => [...prev, { ts: now, value: spread }].filter((p) => now - p.ts <= SPREAD_WINDOW_MS));
    }, [spread]);

    const spreadStats = useMemo(() => {
        if (spreadHistory.length < 2) {
            return { first: null, last: spreadHistory[0]?.value ?? null, changePct: 0 };
        }
        const first = spreadHistory[0].value;
        const last = spreadHistory[spreadHistory.length - 1].value;
        const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
        return { first, last, changePct };
    }, [spreadHistory]);

    useEffect(() => {
        const now = Date.now();
        const lastAnomalyAt = Number(sessionStorage.getItem("order_book_anomaly_ts") || 0);
        const spreadWidening = spreadStats.changePct > 50 && spreadHistory.length >= 5;
        const imbalanceSpike = (bidRatio > 78 || bidRatio < 22) && depthTotal > 0;

        if ((spreadWidening || imbalanceSpike) && now - lastAnomalyAt > ANOMALY_COOLDOWN_MS) {
            const detail = {
                id: now,
                symbol: selectedSymbol,
                source: "orderBook",
                type: "anomaly",
                spread: spreadStats.last,
                spreadChangePct: spreadStats.changePct,
                bidRatio,
                message: spreadWidening
                    ? `${selectedSymbol}/INR spread widened ${spreadStats.changePct.toFixed(2)}% in the last 5m.`
                    : `${selectedSymbol}/INR depth imbalance detected (bid ratio ${bidRatio.toFixed(1)}%).`,
                time: now,
            };

            window.dispatchEvent(new CustomEvent("market-anomaly-alert", { detail }));
            sessionStorage.setItem("order_book_anomaly_ts", String(now));
        }
    }, [selectedSymbol, spreadStats, bidRatio, depthTotal, spreadHistory.length]);

    return (
        <div className="eth-chart">
            <button
                className="trade-toggle-btn"
                onClick={() => setIsSidebarOpen((p) => !p)}
                style={{ right: "10px" }}
            >
                {isSidebarOpen ? "Hide Trades" : "Show Trades"}
            </button>

            <div className="eth-chart-container">
                <div className="main-chart-title-row">
                    <h2>{selectedSymbol} Live Price Chart ({currency})</h2>
                    <span className="wazirx-badge">WazirX</span>
                    <span className="feed-mode-badge">Feed: {feedMode === "ws" ? "WebSocket" : "Polling"}</span>
                </div>

                <div className="main-symbol-row">
                    {TRADE_SYMBOLS.map((symbol) => (
                        <button
                            key={symbol}
                            className={`chart-tf-btn ${selectedSymbol === symbol ? "chart-tf-active" : ""}`}
                            onClick={() => {
                                setSelectedSymbol(symbol);
                                setSpreadHistory([]);
                                setOrderBook({ bids: [], asks: [] });
                            }}
                        >
                            {symbol}/INR
                        </button>
                    ))}
                </div>

                <div className="chart-price-row">
                    {livePrice !== null && (
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

                <div style={{ height: "400px", width: "100%", position: "relative" }}>
                    {loading && displayPrices.length === 0 && <PulseWaveLoader />}
                    <Line
                        data={{
                            labels: displayLabels,
                            datasets: [
                                {
                                    label: `${selectedSymbol}/${currency}`,
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

            <div
                className="eth-chart-sidebar"
                style={{
                    minWidth: isSidebarOpen ? "320px" : "0px",
                    maxWidth: isSidebarOpen ? "360px" : "0px",
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
                                {buyPoints.filter((b) => b.symbol === selectedSymbol).map((b, index) => {
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

                        <h3 style={{ marginTop: "22px" }}>Order Book ({selectedSymbol}/INR)</h3>
                        <div className="order-book-meta">
                            <span>
                                Spread: {spread === null
                                    ? "--"
                                    : `${currencySymbol}${convert(spread).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </span>
                            <span>Bid Depth: {bidDepthTotal.toFixed(4)} {selectedSymbol}</span>
                            <span>Ask Depth: {askDepthTotal.toFixed(4)} {selectedSymbol}</span>
                            <span>
                                Bid VWAP: {bidVWAP === null ? "--" : `${currencySymbol}${convert(bidVWAP).toFixed(2)}`}
                            </span>
                            <span>
                                Ask VWAP: {askVWAP === null ? "--" : `${currencySymbol}${convert(askVWAP).toFixed(2)}`}
                            </span>
                        </div>

                        <div className="depth-balance-track" aria-label="order-book-depth-balance">
                            <div className="depth-balance-bid" style={{ width: `${bidRatio}%` }} />
                        </div>

                        <div className="spread-trend-wrap">
                            <div className="spread-trend-header">
                                <span>Spread Trend (5m)</span>
                                <span className={spreadStats.changePct >= 0 ? "spread-up" : "spread-down"}>
                                    {spreadStats.changePct >= 0 ? "+" : ""}{spreadStats.changePct.toFixed(2)}%
                                </span>
                            </div>
                            <SpreadSparkline points={spreadHistory} />
                        </div>

                        <div className="order-book-grid order-book-grid-ladder">
                            <div className="order-book-col">
                                <h4>Asks (Price / Qty / CumQty)</h4>
                                {depthLadder.asks.length === 0 && <p className="order-book-empty">No ask data</p>}
                                {depthLadder.asks.map((ask, idx) => (
                                    <div key={`ask-${ask.price}-${idx}`} className="order-row order-ask">
                                        <span>{currencySymbol}{convert(ask.price).toFixed(2)}</span>
                                        <span>{ask.qty.toFixed(4)}</span>
                                        <span>{ask.cumQty.toFixed(4)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="order-book-col">
                                <h4>Bids (Price / Qty / CumQty)</h4>
                                {depthLadder.bids.length === 0 && <p className="order-book-empty">No bid data</p>}
                                {depthLadder.bids.map((bid, idx) => (
                                    <div key={`bid-${bid.price}-${idx}`} className="order-row order-bid">
                                        <span>{currencySymbol}{convert(bid.price).toFixed(2)}</span>
                                        <span>{bid.qty.toFixed(4)}</span>
                                        <span>{bid.cumQty.toFixed(4)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
