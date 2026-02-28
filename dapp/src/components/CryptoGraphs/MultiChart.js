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

export default function MultiChart() {

    const tokenList = [
        "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT", "AVAX", "TRX",
        "LINK", "MATIC", "SHIB", "LTC", "UNI"
    ];

    const [token, setToken] = useState("BTC");

    const [tokenPrice, setTokenPrice] = useState([]);
    const [tokenTime, setTokenTime] = useState([]);

    const lastUpdate = useRef(Date.now());

    const [baseline, setBaseline] = useState("");
    const baselineValue = parseFloat(baseline) || null;

    // Shared price-point adder with 1-second throttle
    const addPricePoint = useCallback((price) => {
        if (isNaN(price)) return;
        const now = Date.now();
        if (now - lastUpdate.current < 1000) return;
        lastUpdate.current = now;
        setTokenPrice((prev) => [...prev.slice(-30), price]);
        setTokenTime((prev) => [...prev.slice(-30), new Date().toLocaleTimeString()]);
    }, []);

    // PRIMARY: REST polling every 2 seconds — always active
    const pollingRef = useRef(null);
    const wsRef = useRef(null);

    useEffect(() => {
        // Clear previous state
        setTokenPrice([]);
        setTokenTime([]);
        lastUpdate.current = 0; // allow immediate first point

        const symbol = token.toLowerCase() + "inr";

        // --- REST polling (primary, guaranteed data) ---
        const fetchPrice = async () => {
            try {
                const resp = await fetch(`${WAZIRX_TICKER_URL}?symbol=${symbol}`);
                if (!resp.ok) return;
                const data = await resp.json();
                addPricePoint(parseFloat(data.lastPrice));
            } catch (err) {
                console.error("WazirX REST error:", err);
            }
        };

        fetchPrice(); // immediate first fetch
        pollingRef.current = setInterval(fetchPrice, 2000);

        // --- WebSocket bonus (real-time when trades happen) ---
        try {
            wsRef.current = new WebSocket(WAZIRX_WS_URL);
            wsRef.current.onopen = () => {
                wsRef.current.send(JSON.stringify({
                    event: "subscribe",
                    streams: [`${symbol}@trades`]
                }));
            };
            wsRef.current.onmessage = (msg) => {
                const parsed = JSON.parse(msg.data);
                if (!parsed.data?.trades?.length) return;
                const latestTrade = parsed.data.trades[parsed.data.trades.length - 1];
                addPricePoint(parseFloat(latestTrade.p));
            };
        } catch {
            // REST polling handles data delivery
        }

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
            wsRef.current?.close();
        };
    }, [token, addPricePoint]);

    const makeBaseline = (v, length) => (v ? Array(length).fill(v) : []);

    return (
        <div className="multi-chart-wrapper">
            <div className="multi-chart-header">
                <div className="main-chart-title-row">
                    <h2>{token} WazirX Price Chart</h2>
                    <span className="wazirx-badge">WazirX</span>
                </div>

                <div className="multi-chart-controls">
                    <select
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className="multi-chart-select"
                    >
                        {tokenList.map((t) => (
                            <option key={t} value={t}>
                                {t}/INR
                            </option>
                        ))}
                    </select>

                    <input
                        type="number"
                        placeholder="Set baseline price (INR)..."
                        value={baseline}
                        onChange={(e) => setBaseline(e.target.value)}
                        className="multi-chart-input"
                    />
                </div>
            </div>

            <div style={{ height: "350px" }}>
                <Line
                    data={{
                        labels: tokenTime,
                        datasets: [
                            {
                                label: `${token}/INR`,
                                data: tokenPrice,
                                borderColor: "#8b5cf6",
                                backgroundColor: "rgba(139, 92, 246, 0.1)",
                                tension: 0.4,
                                fill: true,
                            },
                            ...(baselineValue
                                ? [
                                    {
                                        label: "Baseline",
                                        data: makeBaseline(baselineValue, tokenPrice.length),
                                        borderColor: "rgba(255, 255, 255, 0.3)",
                                        borderDash: [6, 6],
                                        tension: 0,
                                        pointRadius: 0,
                                    },
                                ]
                                : []),
                        ],
                    }}
                    options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                ticks: {
                                    color: "rgba(255,255,255,0.3)",
                                    autoSkip: true,
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
                        },
                    }}
                />
            </div>
        </div>
    );
}
