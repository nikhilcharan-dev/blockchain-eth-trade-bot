"use client";

import { useEffect, useState } from "react";
import "./PortfolioSummary.css";

const DEMO_HOLDINGS = [
  { symbol: "ETH", amount: 2.5, pair: "ethusdt" },
  { symbol: "BTC", amount: 0.15, pair: "btcusdt" },
  { symbol: "SOL", amount: 30, pair: "solusdt" },
  { symbol: "AVAX", amount: 50, pair: "avaxusdt" },
];

export default function PortfolioSummary() {
  const [prices, setPrices] = useState({});
  const [totalValue, setTotalValue] = useState(0);
  const [change24h, setChange24h] = useState(0);

  useEffect(() => {
    const streams = DEMO_HOLDINGS.map((h) => `${h.pair}@miniTicker`).join("/");
    const ws = new WebSocket(
      `wss://stream.binance.com:9443/stream?streams=${streams}`
    );

    ws.onmessage = (msg) => {
      const { data } = JSON.parse(msg.data);
      if (!data) return;

      const symbol = data.s?.replace("USDT", "");
      const price = parseFloat(data.c);
      const change = parseFloat(data.P);

      setPrices((prev) => ({
        ...prev,
        [symbol]: { price, change },
      }));
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    let total = 0;
    let weightedChange = 0;

    for (const h of DEMO_HOLDINGS) {
      const p = prices[h.symbol];
      if (p) {
        const val = h.amount * p.price;
        total += val;
        weightedChange += val * (p.change / 100);
      }
    }

    setTotalValue(total);
    setChange24h(total > 0 ? (weightedChange / total) * 100 : 0);
  }, [prices]);

  const changeClass = change24h >= 0 ? "portfolio-up" : "portfolio-down";

  return (
    <div className="portfolio-summary">
      <div className="portfolio-card portfolio-total">
        <span className="portfolio-label">Portfolio Value</span>
        <span className="portfolio-value">
          ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className={`portfolio-change ${changeClass}`}>
          {change24h >= 0 ? "+" : ""}
          {change24h.toFixed(2)}% (24h)
        </span>
      </div>

      <div className="portfolio-holdings">
        {DEMO_HOLDINGS.map((h) => {
          const p = prices[h.symbol];
          const val = p ? h.amount * p.price : 0;
          const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;

          return (
            <div key={h.symbol} className="portfolio-holding-card">
              <div className="holding-header">
                <span className="holding-symbol">{h.symbol}</span>
                <span className="holding-amount">{h.amount}</span>
              </div>
              <div className="holding-value">
                ${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="holding-bar-container">
                <div
                  className="holding-bar"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="holding-pct">{pct.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
