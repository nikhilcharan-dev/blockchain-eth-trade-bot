"use client";

import { useEffect, useRef, useState } from "react";
import "./PriceTicker.css";

const TOKENS = [
  { symbol: "BTC", pair: "btcusdt" },
  { symbol: "ETH", pair: "ethusdt" },
  { symbol: "SOL", pair: "solusdt" },
  { symbol: "XRP", pair: "xrpusdt" },
  { symbol: "BNB", pair: "bnbusdt" },
  { symbol: "ADA", pair: "adausdt" },
  { symbol: "DOGE", pair: "dogeusdt" },
  { symbol: "AVAX", pair: "avaxusdt" },
];

export default function PriceTicker() {
  const [prices, setPrices] = useState({});
  const [prevPrices, setPrevPrices] = useState({});
  const wsRefs = useRef({});

  useEffect(() => {
    const streams = TOKENS.map((t) => `${t.pair}@miniTicker`).join("/");
    const ws = new WebSocket(
      `wss://stream.binance.com:9443/stream?streams=${streams}`
    );

    ws.onmessage = (msg) => {
      const { data } = JSON.parse(msg.data);
      if (!data) return;

      const symbol = data.s?.replace("USDT", "");
      if (!symbol) return;

      const price = parseFloat(data.c);
      const change = parseFloat(data.P);

      setPrevPrices((prev) => ({
        ...prev,
        [symbol]: prev[symbol] !== undefined ? prices[symbol]?.price : price,
      }));

      setPrices((prev) => ({
        ...prev,
        [symbol]: { price, change },
      }));
    };

    return () => ws.close();
  }, []);

  const formatPrice = (price) => {
    if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  return (
    <div className="ticker-wrapper">
      <div className="ticker-track">
        {[...TOKENS, ...TOKENS].map((t, i) => {
          const data = prices[t.symbol];
          const changeClass = data?.change >= 0 ? "ticker-up" : "ticker-down";

          return (
            <div key={`${t.symbol}-${i}`} className="ticker-item">
              <span className="ticker-symbol">{t.symbol}</span>
              <span className="ticker-price">
                ${data ? formatPrice(data.price) : "---"}
              </span>
              {data && (
                <span className={`ticker-change ${changeClass}`}>
                  {data.change >= 0 ? "+" : ""}
                  {data.change?.toFixed(2)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
