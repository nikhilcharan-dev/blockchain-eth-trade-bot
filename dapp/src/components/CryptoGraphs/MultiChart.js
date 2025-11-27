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
} from "chart.js";

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

export default function MultiChart() {

    // Popular tokens
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

    // Realtime Token Prices
    useEffect(() => {
        if (tokenWS.current) tokenWS.current.close();

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
        <div style={{ padding: "21vh 20px", maxWidth: "90svw", margin: "auto" }}>
            <h2>{token} Global Price Chart</h2>

            <select
                value={token}
                onChange={(e) => setToken(e.target.value)}
                style={{
                    padding: "10px",
                    fontSize: "16px",
                    border: "1px solid #aaa",
                    borderRadius: "8px",
                    marginBottom: "12px",
                    display: "block",
                }}
            >
                {tokenList.map((t) => (
                    <option key={t} value={t}>
                        {t}
                    </option>
                ))}
            </select>

            <input
                type="number"
                placeholder="Set baseline"
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
                style={{
                    padding: "8px",
                    marginBottom: "20px",
                    borderRadius: "8px",
                    border: "1px solid #aaa",
                    width: "100%",
                }}
            />

            <Line
                data={{
                    labels: tokenTime,
                    datasets: [
                        {
                            label: `${token}/USDT`,
                            data: tokenPrice,
                            borderColor: "rgba(255,99,132,1)",
                            tension: 0.4,
                        },
                        {
                            label: "Baseline",
                            data: makeBaseline(baselineValue, tokenPrice.length),
                            borderColor: "black",
                            borderDash: [6, 6],
                            tension: 0,
                        },
                    ],
                }}
                height={100}
            />
        </div>
    );
}
