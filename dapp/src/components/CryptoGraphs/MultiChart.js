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

    const tokenWS = useRef(null);
    const tokenLastUpdate = useRef(Date.now());
    const fallbackInterval = useRef(null);

    const [baseline, setBaseline] = useState("");
    const baselineValue = parseFloat(baseline) || null;

    const formatTime = () => new Date().toLocaleTimeString();

    // WazirX REST API fallback for polling
    const fetchTokenPrice = useCallback(async (symbol) => {
        try {
            const resp = await fetch(`${WAZIRX_TICKER_URL}?symbol=${symbol}`);
            if (!resp.ok) return;
            const data = await resp.json();
            const price = parseFloat(data.lastPrice);
            if (isNaN(price)) return;

            const now = Date.now();
            if (now - tokenLastUpdate.current >= 1000) {
                tokenLastUpdate.current = now;
                setTokenPrice((prev) => [...prev.slice(-30), price]);
                setTokenTime((prev) => [...prev.slice(-30), formatTime()]);
            }
        } catch (err) {
            console.error("WazirX REST fallback error:", err);
        }
    }, []);

    useEffect(() => {
        if (tokenWS.current) tokenWS.current.close();
        if (fallbackInterval.current) {
            clearInterval(fallbackInterval.current);
            fallbackInterval.current = null;
        }

        setTokenPrice([]);
        setTokenTime([]);

        const symbol = token.toLowerCase() + "inr";

        const startFallback = () => {
            if (!fallbackInterval.current) {
                fallbackInterval.current = setInterval(() => fetchTokenPrice(symbol), 2000);
            }
        };

        try {
            tokenWS.current = new WebSocket(WAZIRX_WS_URL);

            tokenWS.current.onopen = () => {
                tokenWS.current.send(JSON.stringify({
                    event: "subscribe",
                    streams: [`${symbol}@trades`]
                }));
            };

            tokenWS.current.onmessage = (msg) => {
                const parsed = JSON.parse(msg.data);
                if (!parsed.data?.trades?.length) return;

                const latestTrade = parsed.data.trades[parsed.data.trades.length - 1];
                const price = parseFloat(latestTrade.p);
                if (isNaN(price)) return;

                const now = Date.now();
                if (now - tokenLastUpdate.current >= 1000) {
                    tokenLastUpdate.current = now;
                    setTokenPrice((prev) => [...prev.slice(-30), price]);
                    setTokenTime((prev) => [...prev.slice(-30), formatTime()]);
                }
            };

            tokenWS.current.onerror = () => {
                console.warn("WazirX WebSocket error, falling back to REST polling");
                startFallback();
            };

            tokenWS.current.onclose = () => {
                startFallback();
            };
        } catch {
            startFallback();
        }

        return () => {
            tokenWS.current?.close();
            if (fallbackInterval.current) {
                clearInterval(fallbackInterval.current);
                fallbackInterval.current = null;
            }
        };
    }, [token, fetchTokenPrice]);

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
