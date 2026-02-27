"use client";

import { useEffect, useRef, useState } from "react";
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

export default function MainChart() {

    // PRICE MODE (USD / INR)
    const [mode, setMode] = useState("USD");
    const [usdToInr, setUsdToInr] = useState(1);

    useEffect(() => {
        async function fetchRate() {
            try {
                const resp = await fetch("https://open.er-api.com/v6/latest/USD");
                const json = await resp.json();
                if (json && json.rates && json.rates.INR) {
                    setUsdToInr(json.rates.INR);
                    console.log(json.rates.INR);
                }
            } catch (err) {
                console.error("Error fetching FX rate", err);
            }
        }

        fetchRate();
        const interval = setInterval(fetchRate, 10*60*1000); // refresh every 10 min
        return () => clearInterval(interval);
    }, []);


    const convert = (usd) => (mode === "INR" ? usd * usdToInr : usd);

    // ETH LIVE PRICE (RAW USD)
    const [ethPriceRaw, setEthPriceRaw] = useState([]);
    const [ethTime, setEthTime] = useState([]);

    const ethWS = useRef(null);
    const ethLastUpdate = useRef(Date.now());

    const formatTime = () => new Date().toLocaleTimeString();

    // BUY POINTS
    const [buyPoints, setBuyPoints] = useState([]);

    const [newBuyName, setNewBuyName] = useState("");
    const [newBuyPrice, setNewBuyPrice] = useState("");

    const addBuy = () => {
        if (!newBuyName || !newBuyPrice) return;

        const price = parseFloat(newBuyPrice); // stored in USD
        if (isNaN(price)) return;

        const lastTime = ethTime[ethTime.length - 1] || formatTime();

        setBuyPoints((prev) => [
            ...prev,
            {
                id: Date.now(),
                name: newBuyName,
                usdPrice: price, // store buy in USD
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

    // ETH WEBSOCKET
    useEffect(() => {
        ethWS.current = new WebSocket("wss://stream.binance.com:9443/ws/ethusdt@trade");

        ethWS.current.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            const priceUSD = parseFloat(data.p);
            const now = Date.now();

            if (now - ethLastUpdate.current >= 1000) {
                ethLastUpdate.current = now;

                setEthPriceRaw((prev) => [...prev.slice(-30), priceUSD]);
                setEthTime((prev) => [...prev.slice(-30), formatTime()]);
            }
        };

        return () => ethWS.current && ethWS.current.close();
    }, []);

    // Convert all ETH prices into selected mode
    const ethPrice = ethPriceRaw.map((p) => convert(p));

    // CHART BUY LINES & MARKERS
    const colors = ["#ff6347", "#ffa500", "#32cd32", "#00bfff", "#8a2be2", "#ff69b4"];

    const buyLineDatasets = buyPoints.map((b, index) => ({
        label: `${b.name} (Buy @ ${convert(b.usdPrice).toFixed(2)} ${mode})`,
        data: Array(ethPrice.length).fill(convert(b.usdPrice)),
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
                y: convert(b.usdPrice),
            },
        ],
        backgroundColor: colors[index % colors.length],
        pointRadius: 6,
    }));

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
                <h2>ETH Live Price Chart ({mode})</h2>

                {/* USD / INR Switch */}
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                >
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
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
                            placeholder="Buy price in USD"
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
                                const buy = convert(b.usdPrice);
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

                                        <td className="trade-cell">@ {buy.toFixed(2)}</td>

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
