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

    const [baseline, setBaseline] = useState("");
    const baselineValue = parseFloat(baseline) || null;

    const formatTime = () => new Date().toLocaleTimeString();

    useEffect(() => {
        if (tokenWS.current) tokenWS.current.close();

        setTokenPrice([]);
        setTokenTime([]);

        const symbol = token.toLowerCase() + "usdt";
        tokenWS.current = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@trade`);

        tokenWS.current.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            const price = parseFloat(data.p);
            const now = Date.now();

            if (now - tokenLastUpdate.current >= 1000) {
                tokenLastUpdate.current = now;

                setTokenPrice((prev) => [...prev.slice(-30), price]);
                setTokenTime((prev) => [...prev.slice(-30), formatTime()]);
            }
        };

        return () => tokenWS.current?.close();
    }, [token]);

    const makeBaseline = (v, length) => (v ? Array(length).fill(v) : []);

    return (
        <div className="multi-chart-wrapper">
            <div className="multi-chart-header">
                <h2>{token} Global Price Chart</h2>

                <div className="multi-chart-controls">
                    <select
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className="multi-chart-select"
                    >
                        {tokenList.map((t) => (
                            <option key={t} value={t}>
                                {t}/USDT
                            </option>
                        ))}
                    </select>

                    <input
                        type="number"
                        placeholder="Set baseline price..."
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
                                label: `${token}/USDT`,
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
