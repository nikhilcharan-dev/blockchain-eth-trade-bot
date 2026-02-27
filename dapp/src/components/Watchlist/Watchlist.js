"use client";

import { useState } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import "./Watchlist.css";

const AVAILABLE_TOKENS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT",
  "AVAX", "TRX", "LINK", "MATIC", "SHIB", "LTC", "UNI",
];

export default function Watchlist() {
  const [watchlist, setWatchlist] = useState(["BTC", "ETH", "SOL", "XRP"]);
  const [showAdd, setShowAdd] = useState(false);
  const { wazirxPrices, formatPrice, formatVolume, pairLabel } = useCurrency();

  const addToken = (token) => {
    if (!watchlist.includes(token)) {
      setWatchlist((prev) => [...prev, token]);
    }
    setShowAdd(false);
  };

  const removeToken = (token) => {
    setWatchlist((prev) => prev.filter((t) => t !== token));
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
          const p = wazirxPrices[token];
          const changeClass =
            p?.change >= 0 ? "wl-change-up" : "wl-change-down";

          return (
            <div key={token} className="watchlist-row">
              <span className="wl-col wl-col-name">
                <strong>{token}</strong>
                <span className="wl-pair">{pairLabel}</span>
              </span>
              <span className="wl-col wl-col-price">
                {p ? formatPrice(p.priceInr) : "---"}
              </span>
              <span className={`wl-col wl-col-change ${changeClass}`}>
                {p
                  ? `${p.change >= 0 ? "+" : ""}${p.change.toFixed(2)}%`
                  : "---"}
              </span>
              <span className="wl-col wl-col-hl">
                {p
                  ? `${formatPrice(p.highInr)} / ${formatPrice(p.lowInr)}`
                  : "---"}
              </span>
              <span className="wl-col wl-col-vol">
                {p ? formatVolume(p.quoteVolumeInr) : "---"}
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
