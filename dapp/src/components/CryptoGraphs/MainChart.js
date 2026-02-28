"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
import './styles.css'

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler);

const WAZIRX_WS_URL = "wss://stream.wazirx.com/stream";
const WAZIRX_TICKER_URL = "https://api.wazirx.com/sapi/v1/ticker/24hr";

export default function MainChart() {

    // PRICE MODE (INR / USD)
    const [mode, setMode] = useState("INR");
    const [usdToInr, setUsdToInr] = useState(83.5);

    useEffect(() => {
        async function fetchRate() {
            try {
                const resp = await fetch("https://open.er-api.com/v6/latest/USD");
                const json = await resp.json();
                if (json?.rates?.INR) {
                    setUsdToInr(json.rates.INR);
                }
            } catch (err) {
                console.error("Error fetching FX rate", err);
            }
        }

        fetchRate();
        const interval = setInterval(fetchRate, 10 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Convert from INR (WazirX native) to display currency
    const convert = (inr) => (mode === "USD" ? inr / usdToInr : inr);

    // ETH LIVE PRICE (RAW INR from WazirX)
    const [ethPriceRaw, setEthPriceRaw] = useState([]);
    const [ethTime, setEthTime] = useState([]);

    const ethWS = useRef(null);
    const ethLastUpdate = useRef(Date.now());
    const fallbackInterval = useRef(null);

    const formatTime = () => new Date().toLocaleTimeString();

    // BUY POINTS (stored in INR internally)
    const [buyPoints, setBuyPoints] = useState([]);

    const [newBuyName, setNewBuyName] = useState("");
    const [newBuyPrice, setNewBuyPrice] = useState("");

    const addBuy = () => {
        if (!newBuyName || !newBuyPrice) return;

        const price = parseFloat(newBuyPrice);
        if (isNaN(price)) return;

        // Convert to INR for storage if entered in USD mode
        const inrPrice = mode === "USD" ? price * usdToInr : price;

        const lastTime = ethTime[ethTime.length - 1] || formatTime();

        setBuyPoints((prev) => [
            ...prev,
            {
                id: Date.now(),
                name: newBuyName,
                inrPrice: inrPrice,
                time: lastTime,
            },
        ]);

        setNewBuyName("");
        setNewBuyPrice("");
    };

    const deleteBuy = (id) => {
        setBuyPoints((prev) => prev.filter((b) => b.id !== id));
    };

    // SIDEBAR TOGGLE
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const toggleSidebar = () => {
        setIsSidebarOpen((prev) => !prev);
    };

    // WazirX REST API fallback
    const fetchEthPrice = useCallback(async () => {
        try {
            const resp = await fetch(`${WAZIRX_TICKER_URL}?symbol=ethinr`);
            if (!resp.ok) return;
            const data = await resp.json();
            const priceINR = parseFloat(data.lastPrice);
            if (isNaN(priceINR)) return;

            const now = Date.now();
            if (now - ethLastUpdate.current >= 1000) {
                ethLastUpdate.current = now;
                setEthPriceRaw((prev) => [...prev.slice(-30), priceINR]);
                setEthTime((prev) => [...prev.slice(-30), formatTime()]);
            }
        } catch (err) {
            console.error("WazirX REST fallback error:", err);
        }
    }, []);

    // WazirX WebSocket + REST fallback
    useEffect(() => {
        try {
            ethWS.current = new WebSocket(WAZIRX_WS_URL);

            ethWS.current.onopen = () => {
                ethWS.current.send(JSON.stringify({
                    event: "subscribe",
                    streams: ["ethinr@trades"]
                }));
            };

            ethWS.current.onmessage = (msg) => {
                const parsed = JSON.parse(msg.data);
                if (!parsed.data?.trades?.length) return;

                const latestTrade = parsed.data.trades[parsed.data.trades.length - 1];
                const priceINR = parseFloat(latestTrade.p);
                if (isNaN(priceINR)) return;

                const now = Date.now();
                if (now - ethLastUpdate.current >= 1000) {
                    ethLastUpdate.current = now;
                    setEthPriceRaw((prev) => [...prev.slice(-30), priceINR]);
                    setEthTime((prev) => [...prev.slice(-30), formatTime()]);
                }
            };

            ethWS.current.onerror = () => {
                console.warn("WazirX WebSocket error, falling back to REST polling");
                if (!fallbackInterval.current) {
                    fallbackInterval.current = setInterval(fetchEthPrice, 2000);
                }
            };

            ethWS.current.onclose = () => {
                if (!fallbackInterval.current) {
                    fallbackInterval.current = setInterval(fetchEthPrice, 2000);
                }
            };
        } catch {
            fallbackInterval.current = setInterval(fetchEthPrice, 2000);
        }

        return () => {
            ethWS.current?.close();
            if (fallbackInterval.current) {
                clearInterval(fallbackInterval.current);
                fallbackInterval.current = null;
            }
        };
    }, [fetchEthPrice]);

    // Convert all ETH prices into selected mode
    const ethPrice = ethPriceRaw.map((p) => convert(p));

    // CHART BUY LINES & MARKERS
    const colors = ["#ff6347", "#ffa500", "#32cd32", "#00bfff", "#8a2be2", "#ff69b4"];

    const buyLineDatasets = buyPoints.map((b, index) => ({
        label: `${b.name} (Buy @ ${convert(b.inrPrice).toFixed(2)} ${mode})`,
        data: Array(ethPrice.length).fill(convert(b.inrPrice)),
        borderColor: colors[index % colors.length],
        borderDash: [6, 6],
        tension: 0,
    }));

    const buyMarkers = buyPoints.map((b, index) => ({
        type: "scatter",
        label: `${b.name} Entry`,
        data: [
            {
                x: b.time,
                y: convert(b.inrPrice),
            },
        ],
        backgroundColor: colors[index % colors.length],
        pointRadius: 6,
    }));

    const currencySymbol = mode === "INR" ? "₹" : "$";

    return (
        <div className="eth-chart">
            {/* Sidebar toggle button */}
            <button
                className="trade-toggle-btn"
                onClick={toggleSidebar}
                style={{ right: "10px" }}
            >
                {isSidebarOpen ? "Hide Trades" : "Show Trades"}
            </button>

            {/* ==================== CHART ==================== */}
            <div className="eth-chart-container">
                <div className="main-chart-title-row">
                    <h2>ETH Live Price Chart ({mode})</h2>
                    <span className="wazirx-badge">WazirX</span>
                </div>

                {/* INR / USD Switch */}
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                >
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                </select>

                <div style={{ height: "400px", width: "100%" }}>
                    <Line
                        data={{
                            labels: ethTime,
                            datasets: [
                                {
                                    label: `ETH/${mode}`,
                                    data: ethPrice,
                                    borderColor: "#6366f1",
                                    backgroundColor: "rgba(99, 102, 241, 0.1)",
                                    tension: 0.4,
                                    fill: true,
                                },
                                ...buyLineDatasets,
                                ...buyMarkers,
                            ],
                        }}
                        options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: {
                                    ticks: { color: "rgba(255,255,255,0.3)", autoSkip: true, maxRotation: 0, minRotation: 0 },
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
                            },
                        }}
                    />
                </div>
            </div>

            {/* ==================== SIDEBAR ==================== */}
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

                        <input
                            type="text"
                            placeholder="Trade name"
                            value={newBuyName}
                            onChange={(e) => setNewBuyName(e.target.value)}
                        />

                        <input
                            type="number"
                            placeholder={`Buy price in ${mode}`}
                            value={newBuyPrice}
                            onChange={(e) => setNewBuyPrice(e.target.value)}
                        />

                        <button onClick={addBuy}>
                            Add Buy
                        </button>

                        <h3 style={{ marginTop: "20px" }}>Active Trades</h3>

                        <table className="trade-table">
                            <tbody>
                            {buyPoints.map((b, index) => {
                                const buy = convert(b.inrPrice);
                                const current = ethPrice[ethPrice.length - 1] || buy;

                                const pnl = current - buy;
                                const pnlPercent = (pnl / buy) * 100;

                                const pnlClass =
                                    pnl > 0 ? "pnl-profit" : pnl < 0 ? "pnl-loss" : "pnl-neutral";

                                return (
                                    <tr key={b.id} className="trade-row">
                                        <td className="trade-cell">
                                            <span
                                                className="trade-color-dot"
                                                style={{ background: colors[index % colors.length] }}
                                            />
                                            {b.name}
                                        </td>

                                        <td className="trade-cell">@ {currencySymbol}{buy.toFixed(2)}</td>

                                        <td className={`trade-cell ${pnlClass}`}>
                                            {pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)
                                        </td>

                                        <td className="trade-cell" style={{ textAlign: "right" }}>
                                            <button className="delete-btn" onClick={() => deleteBuy(b.id)}>
                                                X
                                            </button>
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
