"use client";

import { useEffect, useState, useRef } from "react";
import "./PortfolioSummary.css";

const AVAILABLE_TOKENS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT",
  "AVAX", "TRX", "LINK", "MATIC", "SHIB", "LTC", "UNI",
];

const STORAGE_KEY = "portfolio_holdings";

function loadHoldings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveHoldings(holdings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
}

export default function PortfolioSummary() {
  const [holdings, setHoldings] = useState([]);
  const [prices, setPrices] = useState({});
  const [totalValue, setTotalValue] = useState(0);
  const [change24h, setChange24h] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const wsRef = useRef(null);

  // Load holdings from localStorage on mount
  useEffect(() => {
    setHoldings(loadHoldings());
  }, []);

  // WebSocket connection for real-time prices
  useEffect(() => {
    if (wsRef.current) wsRef.current.close();
    if (holdings.length === 0) return;

    const streams = holdings
      .map((h) => `${h.symbol.toLowerCase()}usdt@miniTicker`)
      .join("/");

    wsRef.current = new WebSocket(
      `wss://stream.binance.com:9443/stream?streams=${streams}`
    );

    wsRef.current.onmessage = (msg) => {
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

    return () => wsRef.current?.close();
  }, [holdings]);

  // Calculate totals
  useEffect(() => {
    let total = 0;
    let weightedChange = 0;

    for (const h of holdings) {
      const p = prices[h.symbol];
      if (p) {
        const val = h.amount * p.price;
        total += val;
        weightedChange += val * (p.change / 100);
      }
    }

    setTotalValue(total);
    setChange24h(total > 0 ? (weightedChange / total) * 100 : 0);
  }, [prices, holdings]);

  const addHolding = () => {
    const symbol = newSymbol.toUpperCase().trim();
    const amount = parseFloat(newAmount);
    if (!symbol || isNaN(amount) || amount <= 0) return;

    const existing = holdings.find((h) => h.symbol === symbol);
    let updated;
    if (existing) {
      updated = holdings.map((h) =>
        h.symbol === symbol ? { ...h, amount: h.amount + amount } : h
      );
    } else {
      updated = [...holdings, { symbol, amount }];
    }

    setHoldings(updated);
    saveHoldings(updated);
    setNewSymbol("");
    setNewAmount("");
    setShowAdd(false);
  };

  const removeHolding = (symbol) => {
    const updated = holdings.filter((h) => h.symbol !== symbol);
    setHoldings(updated);
    saveHoldings(updated);
  };

  const changeClass = change24h >= 0 ? "portfolio-up" : "portfolio-down";

  const available = AVAILABLE_TOKENS.filter(
    (t) => !holdings.find((h) => h.symbol === t)
  );

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

        <button
          className="portfolio-add-btn"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? "Cancel" : "+ Add Holding"}
        </button>

        {showAdd && (
          <div className="portfolio-add-form">
            <select
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
              className="portfolio-select"
            >
              <option value="">Select token</option>
              {available.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Amount"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="portfolio-input"
              min="0"
              step="any"
            />
            <button className="portfolio-confirm-btn" onClick={addHolding}>
              Add
            </button>
          </div>
        )}

        {holdings.length === 0 && (
          <span className="portfolio-empty">
            No holdings yet. Add your tokens to track your portfolio.
          </span>
        )}
      </div>

      <div className="portfolio-holdings">
        {holdings.map((h) => {
          const p = prices[h.symbol];
          const val = p ? h.amount * p.price : 0;
          const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;

          return (
            <div key={h.symbol} className="portfolio-holding-card">
              <div className="holding-header">
                <span className="holding-symbol">{h.symbol}</span>
                <button
                  className="holding-remove-btn"
                  onClick={() => removeHolding(h.symbol)}
                  title="Remove holding"
                >
                  x
                </button>
              </div>
              <div className="holding-amount-row">
                <span className="holding-amount">{h.amount} {h.symbol}</span>
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
