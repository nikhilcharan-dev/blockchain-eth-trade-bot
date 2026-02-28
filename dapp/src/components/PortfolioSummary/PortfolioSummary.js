"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrency } from "@/context/CurrencyContext";
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
  const [totalValue, setTotalValue] = useState(0);
  const [change24h, setChange24h] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newAmount, setNewAmount] = useState("");

  // WazirX wallet state
  const [wazirxConnected, setWazirxConnected] = useState(false);
  const [walletHoldings, setWalletHoldings] = useState([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState(null);
  const [walletTotalValue, setWalletTotalValue] = useState(0);
  const [walletTotalInvested, setWalletTotalInvested] = useState(0);
  const [walletChange24h, setWalletChange24h] = useState(0);

  const { wazirxPrices, formatValue, formatPrice } = useCurrency();

  // Check WazirX connection on mount via server-side settings
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings?.hasWazirxCredentials) {
          setWazirxConnected(true);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch WazirX portfolio (funds + avg buy prices)
  const fetchWalletPortfolio = useCallback(async () => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const resp = await fetch("/api/wazirx/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch portfolio");

      const tokens = (Array.isArray(data) ? data : []).filter(
        (t) => t.amount > 0
      );
      setWalletHoldings(tokens);
    } catch (err) {
      setWalletError(err.message);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  // Auto-fetch wallet when connected
  useEffect(() => {
    if (wazirxConnected) fetchWalletPortfolio();
  }, [wazirxConnected, fetchWalletPortfolio]);

  // Load manual holdings on mount
  useEffect(() => {
    setHoldings(loadHoldings());
  }, []);

  // Calculate manual portfolio totals
  useEffect(() => {
    let totalInr = 0;
    let weightedChange = 0;

    for (const h of holdings) {
      const p = wazirxPrices[h.symbol];
      if (p) {
        const val = h.amount * p.priceInr;
        totalInr += val;
        weightedChange += val * (p.change / 100);
      }
    }

    setTotalValue(totalInr);
    setChange24h(totalInr > 0 ? (weightedChange / totalInr) * 100 : 0);
  }, [wazirxPrices, holdings]);

  // Calculate wallet portfolio totals
  useEffect(() => {
    if (!wazirxConnected || walletHoldings.length === 0) {
      setWalletTotalValue(0);
      setWalletTotalInvested(0);
      setWalletChange24h(0);
      return;
    }

    let totalInr = 0;
    let totalInvested = 0;
    let weightedChange = 0;

    for (const h of walletHoldings) {
      const p = wazirxPrices[h.symbol];
      if (p) {
        const val = h.amount * p.priceInr;
        totalInr += val;
        weightedChange += val * (p.change / 100);
      }
      if (h.totalInvested) {
        totalInvested += h.totalInvested;
      }
    }

    setWalletTotalValue(totalInr);
    setWalletTotalInvested(totalInvested);
    setWalletChange24h(totalInr > 0 ? (weightedChange / totalInr) * 100 : 0);
  }, [wazirxPrices, walletHoldings, wazirxConnected]);

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
  const walletChangeClass = walletChange24h >= 0 ? "portfolio-up" : "portfolio-down";

  const available = AVAILABLE_TOKENS.filter(
    (t) => !holdings.find((h) => h.symbol === t)
  );

  // Wallet holdings that have a matching price (tradeable tokens)
  const priceableWallet = walletHoldings.filter((h) => wazirxPrices[h.symbol]);
  // Wallet holdings without price data (INR, other non-tradeable)
  const otherWallet = walletHoldings.filter((h) => !wazirxPrices[h.symbol]);

  // Overall P/L
  const overallPL = walletTotalInvested > 0
    ? ((walletTotalValue - walletTotalInvested) / walletTotalInvested) * 100
    : null;
  const overallPLClass = overallPL !== null && overallPL >= 0 ? "portfolio-up" : "portfolio-down";

  return (
    <div className="portfolio-summary-wrapper">
      {/* === WazirX Wallet Section === */}
      {wazirxConnected && (
        <div className="portfolio-section">
          <div className="portfolio-section-header">
            <div className="portfolio-section-badge portfolio-badge-wazirx">
              <span className="portfolio-badge-dot"></span>
              WazirX Wallet
            </div>
            <button
              className="portfolio-refresh-btn"
              onClick={fetchWalletPortfolio}
              disabled={walletLoading}
            >
              {walletLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {walletError && (
            <div className="portfolio-error">
              {walletError}
            </div>
          )}

          {!walletError && (
            <div className="portfolio-summary">
              <div className="portfolio-card portfolio-total">
                <span className="portfolio-label">Current Value</span>
                <span className="portfolio-value">
                  {formatValue(walletTotalValue)}
                </span>
                {walletTotalValue > 0 && (
                  <span className={`portfolio-change ${walletChangeClass}`}>
                    {walletChange24h >= 0 ? "+" : ""}
                    {walletChange24h.toFixed(2)}% (24h)
                  </span>
                )}
                {walletTotalInvested > 0 && (
                  <div className="portfolio-pl-summary">
                    <span className="portfolio-label-sm">Invested: {formatValue(walletTotalInvested)}</span>
                    <span className={`portfolio-change ${overallPLClass}`}>
                      Overall P/L: {overallPL >= 0 ? "+" : ""}{overallPL.toFixed(2)}%
                      {" "}({formatValue(walletTotalValue - walletTotalInvested)})
                    </span>
                  </div>
                )}
                {walletLoading && (
                  <span className="portfolio-loading">Fetching portfolio...</span>
                )}
                {!walletLoading && walletHoldings.length === 0 && (
                  <span className="portfolio-empty">No tokens in wallet</span>
                )}
              </div>

              {/* Token table header */}
              {priceableWallet.length > 0 && (
                <div className="portfolio-table">
                  <div className="portfolio-table-header">
                    <span className="pt-col pt-col-token">Token</span>
                    <span className="pt-col pt-col-amount">Holdings</span>
                    <span className="pt-col pt-col-bought">Bought At</span>
                    <span className="pt-col pt-col-current">Current Price</span>
                    <span className="pt-col pt-col-value">Value</span>
                    <span className="pt-col pt-col-pl">P/L %</span>
                  </div>

                  {/* INR balance row */}
                  {otherWallet.map((h) => (
                    <div key={h.symbol} className="portfolio-table-row portfolio-row-fiat">
                      <span className="pt-col pt-col-token">
                        <strong>{h.symbol}</strong>
                      </span>
                      <span className="pt-col pt-col-amount">{h.free.toFixed(2)}</span>
                      <span className="pt-col pt-col-bought">---</span>
                      <span className="pt-col pt-col-current">---</span>
                      <span className="pt-col pt-col-value">
                        {h.symbol === "INR" ? `₹${h.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : `${h.amount}`}
                      </span>
                      <span className="pt-col pt-col-pl">---</span>
                    </div>
                  ))}

                  {/* Crypto tokens */}
                  {priceableWallet.map((h) => {
                    const p = wazirxPrices[h.symbol];
                    const currentPrice = p ? p.priceInr : 0;
                    const valInr = h.amount * currentPrice;
                    const avgBuyPrice = h.avgBuyPrice || null;
                    const tokenPL = avgBuyPrice && avgBuyPrice > 0
                      ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100
                      : null;
                    const plClass = tokenPL !== null
                      ? (tokenPL >= 0 ? "portfolio-up" : "portfolio-down")
                      : "";

                    return (
                      <div key={h.symbol} className="portfolio-table-row">
                        <span className="pt-col pt-col-token">
                          <strong>{h.symbol}</strong>
                          {h.locked > 0 && (
                            <span className="holding-locked-badge-sm">L:{h.locked}</span>
                          )}
                        </span>
                        <span className="pt-col pt-col-amount">
                          {h.amount} {h.symbol}
                        </span>
                        <span className="pt-col pt-col-bought">
                          {avgBuyPrice ? formatPrice(avgBuyPrice) : "---"}
                        </span>
                        <span className="pt-col pt-col-current">
                          {formatPrice(currentPrice)}
                        </span>
                        <span className="pt-col pt-col-value">
                          {formatValue(valInr)}
                        </span>
                        <span className={`pt-col pt-col-pl ${plClass}`}>
                          {tokenPL !== null
                            ? `${tokenPL >= 0 ? "+" : ""}${tokenPL.toFixed(2)}%`
                            : "---"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* === Manual Portfolio Section === */}
      {!wazirxConnected && (
        <div className="portfolio-section">
          <div className="portfolio-section-header">
            <div className="portfolio-section-badge portfolio-badge-manual">
              Manual Portfolio
            </div>
          </div>

          <div className="portfolio-summary">
            <div className="portfolio-card portfolio-total">
              <span className="portfolio-label">Portfolio Value</span>
              <span className="portfolio-value">
                {formatValue(totalValue)}
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
                  No holdings yet. Add tokens or connect WazirX to view your portfolio.
                </span>
              )}
            </div>

            <div className="portfolio-holdings">
              {holdings.map((h) => {
                const p = wazirxPrices[h.symbol];
                const valInr = p ? h.amount * p.priceInr : 0;
                const pct = totalValue > 0 ? (valInr / totalValue) * 100 : 0;

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
                    {p && (
                      <div className="holding-rate">
                        @ {formatPrice(p.priceInr)}/{h.symbol}
                      </div>
                    )}
                    <div className="holding-value">
                      {formatValue(valInr)}
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
        </div>
      )}
    </div>
  );
}
