"use client";

import { useEffect, useRef, useState } from "react";
import "./Watchlist.css";

const AVAILABLE_TOKENS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT",
  "AVAX", "TRX", "LINK", "MATIC", "SHIB", "LTC", "UNI",
];

export default function Watchlist() {
  const [watchlist, setWatchlist] = useState(["BTC", "ETH", "SOL", "XRP"]);
  const [prices, setPrices] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (wsRef.current) wsRef.current.close();

    if (watchlist.length === 0) return;

    const streams = watchlist
      .map((s) => `${s.toLowerCase()}usdt@miniTicker`)
      .join("/");

    wsRef.current = new WebSocket(
      `wss://stream.binance.com:9443/stream?streams=${streams}`
    );

    wsRef.current.onmessage = (msg) => {
      const { data } = JSON.parse(msg.data);
      if (!data) return;

      const symbol = data.s?.replace("USDT", "");
      if (!symbol) return;

      setPrices((prev) => ({
        ...prev,
        [symbol]: {
          price: parseFloat(data.c),
          change: parseFloat(data.P),
          high: parseFloat(data.h),
          low: parseFloat(data.l),
          volume: parseFloat(data.v),
        },
      }));
    };

    return () => wsRef.current?.close();
  }, [watchlist]);

  const addToken = (token) => {
    if (!watchlist.includes(token)) {
      setWatchlist((prev) => [...prev, token]);
    }
    setShowAdd(false);
  };

  const removeToken = (token) => {
    setWatchlist((prev) => prev.filter((t) => t !== token));
  };

  const formatPrice = (price) => {
    if (price >= 1000)
      return price.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  const formatVolume = (vol) => {
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toFixed(0);
  };

  const available = AVAILABLE_TOKENS.filter((t) => !watchlist.includes(t));

  return (
    <div className="watchlist-container">
      <div className="watchlist-header">
        <h2>Watchlist</h2>
        <button
          className="watchlist-add-btn"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>

      {showAdd && (
        <div className="watchlist-add-panel">
          {available.map((t) => (
            <button
              key={t}
              className="watchlist-token-chip"
              onClick={() => addToken(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="watchlist-table">
        <div className="watchlist-row watchlist-row-header">
          <span className="wl-col wl-col-name">Token</span>
          <span className="wl-col wl-col-price">Price</span>
          <span className="wl-col wl-col-change">24h Change</span>
          <span className="wl-col wl-col-hl">24h High / Low</span>
          <span className="wl-col wl-col-vol">Volume</span>
          <span className="wl-col wl-col-action"></span>
        </div>

        {watchlist.map((token) => {
          const p = prices[token];
          const changeClass =
            p?.change >= 0 ? "wl-change-up" : "wl-change-down";

          return (
            <div key={token} className="watchlist-row">
              <span className="wl-col wl-col-name">
                <strong>{token}</strong>
                <span className="wl-pair">/USDT</span>
              </span>
              <span className="wl-col wl-col-price">
                ${p ? formatPrice(p.price) : "---"}
              </span>
              <span className={`wl-col wl-col-change ${changeClass}`}>
                {p
                  ? `${p.change >= 0 ? "+" : ""}${p.change.toFixed(2)}%`
                  : "---"}
              </span>
              <span className="wl-col wl-col-hl">
                {p
                  ? `$${formatPrice(p.high)} / $${formatPrice(p.low)}`
                  : "---"}
              </span>
              <span className="wl-col wl-col-vol">
                {p ? formatVolume(p.volume) : "---"}
              </span>
              <span className="wl-col wl-col-action">
                <button
                  className="wl-remove-btn"
                  onClick={() => removeToken(token)}
                  title="Remove from watchlist"
                >
                  x
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
