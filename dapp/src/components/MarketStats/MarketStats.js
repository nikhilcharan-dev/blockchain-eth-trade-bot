"use client";

import { useEffect, useState } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import "./MarketStats.css";

export default function MarketStats() {
  const { wazirxPrices, formatPrice, formatVolume, pairLabel } = useCurrency();
  const [fearGreed, setFearGreed] = useState(null);

  // Fetch real Fear & Greed Index from alternative.me API
  useEffect(() => {
    async function fetchFearGreed() {
      try {
        const resp = await fetch("https://api.alternative.me/fng/?limit=1");
        const json = await resp.json();
        if (json?.data?.[0]) {
          const entry = json.data[0];
          setFearGreed({
            score: parseInt(entry.value, 10),
            label: entry.value_classification,
          });
        }
      } catch (err) {
        console.error("Error fetching Fear & Greed Index", err);
      }
    }

    fetchFearGreed();
    const interval = setInterval(fetchFearGreed, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const eth = wazirxPrices.ETH;
  const btc = wazirxPrices.BTC;

  const getFearGreedColor = (score) => {
    if (score >= 75) return "#00e676";
    if (score >= 55) return "#66bb6a";
    if (score >= 45) return "#ffd54f";
    if (score >= 25) return "#ff8a65";
    return "#ff5252";
  };

  return (
    <div className="market-stats">
      <div className="stats-grid">
        {/* ETH Stats */}
        <div className="stat-card">
          <div className="stat-card-header">ETH{pairLabel}</div>
          <div className="stat-row">
            <span className="stat-label">Price</span>
            <span className="stat-value">
              {formatPrice(eth?.priceInr)}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">24h High</span>
            <span className="stat-value stat-high">
              {formatPrice(eth?.highInr)}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">24h Low</span>
            <span className="stat-value stat-low">
              {formatPrice(eth?.lowInr)}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">24h Volume</span>
            <span className="stat-value">{formatVolume(eth?.quoteVolumeInr)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">24h Change</span>
            <span className={`stat-value ${eth?.change >= 0 ? "stat-up" : "stat-down"}`}>
              {eth ? `${eth.change >= 0 ? "+" : ""}${eth.change.toFixed(2)}%` : "---"}
            </span>
          </div>
        </div>

        {/* BTC Stats */}
        <div className="stat-card">
          <div className="stat-card-header">BTC{pairLabel}</div>
          <div className="stat-row">
            <span className="stat-label">Price</span>
            <span className="stat-value">
              {formatPrice(btc?.priceInr)}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">24h High</span>
            <span className="stat-value stat-high">
              {formatPrice(btc?.highInr)}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">24h Low</span>
            <span className="stat-value stat-low">
              {formatPrice(btc?.lowInr)}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">24h Volume</span>
            <span className="stat-value">{formatVolume(btc?.quoteVolumeInr)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">24h Change</span>
            <span className={`stat-value ${btc?.change >= 0 ? "stat-up" : "stat-down"}`}>
              {btc ? `${btc.change >= 0 ? "+" : ""}${btc.change.toFixed(2)}%` : "---"}
            </span>
          </div>
        </div>

        {/* Fear & Greed Index */}
        <div className="stat-card fear-greed-card">
          <div className="stat-card-header">
            Market Sentiment
            <span className="data-source-badge">Live</span>
          </div>
          {fearGreed ? (
            <div className="fear-greed-display">
              <div
                className="fear-greed-gauge"
                style={{
                  background: `conic-gradient(
                    ${getFearGreedColor(fearGreed.score)} ${fearGreed.score * 3.6}deg,
                    rgba(255,255,255,0.06) ${fearGreed.score * 3.6}deg
                  )`,
                }}
              >
                <div className="fear-greed-inner">
                  <span className="fear-greed-score">{fearGreed.score}</span>
                </div>
              </div>
              <span
                className="fear-greed-label"
                style={{ color: getFearGreedColor(fearGreed.score) }}
              >
                {fearGreed.label}
              </span>
            </div>
          ) : (
            <div className="fear-greed-loading">Loading...</div>
          )}
        </div>
      </div>
    </div>
  );
}
