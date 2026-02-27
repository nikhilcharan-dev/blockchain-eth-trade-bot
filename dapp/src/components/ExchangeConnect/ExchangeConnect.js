"use client";

import { useEffect, useState, useCallback } from "react";
import "./ExchangeConnect.css";

const WAZIRX_TICKERS_URL = "https://api.wazirx.com/sapi/v1/tickers/24hr";

const SUPPORTED_PAIRS = [
  { symbol: "BTC", pair: "btcinr" },
  { symbol: "ETH", pair: "ethinr" },
  { symbol: "SOL", pair: "solinr" },
  { symbol: "XRP", pair: "xrpinr" },
  { symbol: "BNB", pair: "bnbinr" },
  { symbol: "ADA", pair: "adainr" },
  { symbol: "DOGE", pair: "dogeinr" },
  { symbol: "DOT", pair: "dotinr" },
  { symbol: "AVAX", pair: "avaxinr" },
  { symbol: "TRX", pair: "trxinr" },
  { symbol: "LINK", pair: "linkinr" },
  { symbol: "MATIC", pair: "maticinr" },
  { symbol: "SHIB", pair: "shibinr" },
  { symbol: "LTC", pair: "ltcinr" },
  { symbol: "UNI", pair: "uniinr" },
];

export default function ExchangeConnect() {
  // Market data
  const [wazirxData, setWazirxData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Connection state
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiSecretInput, setApiSecretInput] = useState("");
  const [apiConnected, setApiConnected] = useState(false);

  // Account data
  const [funds, setFunds] = useState(null);
  const [orders, setOrders] = useState(null);
  const [openOrders, setOpenOrders] = useState(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState(null);

  // Active sub-tab within exchange
  const [activeSection, setActiveSection] = useState("prices");

  // Check saved connection on mount
  useEffect(() => {
    const savedKey = localStorage.getItem("wazirx_api_key");
    const savedSecret = localStorage.getItem("wazirx_api_secret");
    if (savedKey && savedSecret) {
      setApiConnected(true);
    }
  }, []);

  // Fetch public market data
  const fetchWazirxPrices = useCallback(async () => {
    try {
      setError(null);
      const resp = await fetch(WAZIRX_TICKERS_URL);
      if (!resp.ok) throw new Error(`WazirX API error: ${resp.status}`);

      const data = await resp.json();
      const pairMap = {};
      for (const ticker of data) {
        pairMap[ticker.symbol] = ticker;
      }

      const prices = {};
      for (const { symbol, pair } of SUPPORTED_PAIRS) {
        const ticker = pairMap[pair];
        if (ticker) {
          prices[symbol] = {
            price: parseFloat(ticker.lastPrice),
            high: parseFloat(ticker.highPrice),
            low: parseFloat(ticker.lowPrice),
            volume: parseFloat(ticker.volume),
            quoteVolume: parseFloat(ticker.quoteVolume),
            change: parseFloat(ticker.priceChangePercent),
            bidPrice: parseFloat(ticker.bidPrice),
            askPrice: parseFloat(ticker.askPrice),
          };
        }
      }

      setWazirxData(prices);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (err) {
      console.error("WazirX fetch error:", err);
      setError("Unable to fetch WazirX data. The API may be temporarily unavailable.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWazirxPrices();
    const interval = setInterval(fetchWazirxPrices, 10000);
    return () => clearInterval(interval);
  }, [fetchWazirxPrices]);

  // Connect API
  const connectApi = () => {
    const key = apiKeyInput.trim();
    const secret = apiSecretInput.trim();
    if (!key || !secret) return;

    localStorage.setItem("wazirx_api_key", key);
    localStorage.setItem("wazirx_api_secret", secret);
    setApiConnected(true);
    setApiKeyInput("");
    setApiSecretInput("");
  };

  const disconnectApi = () => {
    localStorage.removeItem("wazirx_api_key");
    localStorage.removeItem("wazirx_api_secret");
    setApiConnected(false);
    setFunds(null);
    setOrders(null);
    setOpenOrders(null);
    setAccountError(null);
  };

  // Fetch account data via server-side API routes
  const getCredentials = () => ({
    apiKey: localStorage.getItem("wazirx_api_key"),
    apiSecret: localStorage.getItem("wazirx_api_secret"),
  });

  const fetchFunds = useCallback(async () => {
    setAccountLoading(true);
    setAccountError(null);
    try {
      const resp = await fetch("/api/wazirx/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getCredentials()),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch funds");
      setFunds(data);
    } catch (err) {
      setAccountError(err.message);
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setAccountLoading(true);
    setAccountError(null);
    try {
      const resp = await fetch("/api/wazirx/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getCredentials()),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setAccountError(err.message);
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const fetchOpenOrders = useCallback(async () => {
    setAccountLoading(true);
    setAccountError(null);
    try {
      const resp = await fetch("/api/wazirx/open-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getCredentials()),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch open orders");
      setOpenOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setAccountError(err.message);
    } finally {
      setAccountLoading(false);
    }
  }, []);

  // Auto-fetch account data when connected and section changes
  useEffect(() => {
    if (!apiConnected) return;

    if (activeSection === "balances" && !funds) fetchFunds();
    if (activeSection === "orders" && !orders) fetchOrders();
    if (activeSection === "open-orders" && !openOrders) fetchOpenOrders();
  }, [apiConnected, activeSection, funds, orders, openOrders, fetchFunds, fetchOrders, fetchOpenOrders]);

  const formatPrice = (price) => {
    if (!price) return "---";
    return "₹" + price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatVolume = (vol) => {
    if (!vol) return "---";
    if (vol >= 1e7) return `₹${(vol / 1e7).toFixed(2)}Cr`;
    if (vol >= 1e5) return `₹${(vol / 1e5).toFixed(2)}L`;
    if (vol >= 1e3) return `₹${(vol / 1e3).toFixed(1)}K`;
    return `₹${vol.toFixed(0)}`;
  };

  const sections = apiConnected
    ? [
        { id: "prices", label: "Live Prices" },
        { id: "balances", label: "Wallet" },
        { id: "orders", label: "Order History" },
        { id: "open-orders", label: "Open Orders" },
      ]
    : [{ id: "prices", label: "Live Prices" }];

  return (
    <div className="exchange-connect">
      {/* Connection Card */}
      <div className="exchange-card">
        <div className="exchange-header">
          <div className="exchange-title-row">
            <h2 className="exchange-title">WazirX</h2>
            <span className={`exchange-status ${apiConnected ? "status-connected" : "status-disconnected"}`}>
              {apiConnected ? "Connected" : "Not Connected"}
            </span>
          </div>
          <p className="exchange-subtitle">Indian crypto exchange — INR prices &amp; account management</p>
        </div>

        {!apiConnected ? (
          <div className="exchange-connect-form">
            <p className="exchange-info">
              Connect your WazirX account to view your wallet balances, order history, and open orders.
              Generate API keys from WazirX &rarr; Settings &rarr; API Keys.
            </p>
            <div className="exchange-input-group">
              <input
                type="password"
                placeholder="WazirX API Key"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="exchange-input"
              />
              <input
                type="password"
                placeholder="WazirX API Secret"
                value={apiSecretInput}
                onChange={(e) => setApiSecretInput(e.target.value)}
                className="exchange-input"
              />
              <button className="exchange-connect-btn" onClick={connectApi}>
                Connect Account
              </button>
            </div>
            <p className="exchange-note">
              Your credentials are stored locally in your browser and sent securely to the Next.js server for request signing. They are never stored on any external server.
            </p>
          </div>
        ) : (
          <div className="exchange-connected-info">
            <p className="exchange-connected-text">
              Account connected. API requests are signed server-side via Next.js API routes.
            </p>
            <button className="exchange-disconnect-btn" onClick={disconnectApi}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Sub-navigation tabs */}
      <div className="exchange-tabs">
        {sections.map((s) => (
          <button
            key={s.id}
            className={`exchange-tab ${activeSection === s.id ? "exchange-tab-active" : ""}`}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {(error || accountError) && (
        <div className="exchange-error">{error || accountError}</div>
      )}

      {/* === LIVE PRICES === */}
      {activeSection === "prices" && (
        <div className="exchange-prices-card">
          <div className="exchange-prices-header">
            <h3>WazirX Live Prices (INR)</h3>
            {lastUpdated && (
              <span className="exchange-last-updated">
                Updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>

          {loading ? (
            <div className="exchange-loading">Loading WazirX prices...</div>
          ) : (
            <div className="exchange-price-table">
              <div className="exchange-price-row exchange-price-row-header">
                <span className="ep-col ep-col-name">Token</span>
                <span className="ep-col ep-col-price">Price (INR)</span>
                <span className="ep-col ep-col-change">24h Change</span>
                <span className="ep-col ep-col-hl">24h High / Low</span>
                <span className="ep-col ep-col-vol">Volume</span>
                <span className="ep-col ep-col-spread">Bid / Ask</span>
              </div>

              {SUPPORTED_PAIRS.map(({ symbol }) => {
                const d = wazirxData[symbol];
                if (!d) return null;

                const changeClass = d.change >= 0 ? "ep-change-up" : "ep-change-down";

                return (
                  <div key={symbol} className="exchange-price-row">
                    <span className="ep-col ep-col-name">
                      <strong>{symbol}</strong>
                      <span className="ep-pair">/INR</span>
                    </span>
                    <span className="ep-col ep-col-price">{formatPrice(d.price)}</span>
                    <span className={`ep-col ep-col-change ${changeClass}`}>
                      {d.change >= 0 ? "+" : ""}{d.change?.toFixed(2)}%
                    </span>
                    <span className="ep-col ep-col-hl">
                      {formatPrice(d.high)} / {formatPrice(d.low)}
                    </span>
                    <span className="ep-col ep-col-vol">{formatVolume(d.quoteVolume)}</span>
                    <span className="ep-col ep-col-spread">
                      {formatPrice(d.bidPrice)} / {formatPrice(d.askPrice)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === WALLET BALANCES === */}
      {activeSection === "balances" && apiConnected && (
        <div className="exchange-prices-card">
          <div className="exchange-prices-header">
            <h3>Wallet Balances</h3>
            <button className="exchange-refresh-btn" onClick={fetchFunds}>
              Refresh
            </button>
          </div>

          {accountLoading && !funds ? (
            <div className="exchange-loading">Loading wallet...</div>
          ) : funds ? (
            <div className="exchange-price-table">
              <div className="exchange-price-row exchange-price-row-header">
                <span className="ep-col ep-col-name">Asset</span>
                <span className="ep-col ep-col-price">Free</span>
                <span className="ep-col ep-col-change">Locked</span>
                <span className="ep-col ep-col-hl">Total</span>
              </div>

              {funds
                .filter((f) => parseFloat(f.free) > 0 || parseFloat(f.locked) > 0)
                .sort((a, b) => parseFloat(b.free) + parseFloat(b.locked) - parseFloat(a.free) - parseFloat(a.locked))
                .map((f) => {
                  const free = parseFloat(f.free || 0);
                  const locked = parseFloat(f.locked || 0);
                  const total = free + locked;

                  return (
                    <div key={f.asset} className="exchange-price-row">
                      <span className="ep-col ep-col-name">
                        <strong>{f.asset?.toUpperCase()}</strong>
                      </span>
                      <span className="ep-col ep-col-price">
                        {free > 0.0001 ? free.toFixed(8) : free.toString()}
                      </span>
                      <span className="ep-col ep-col-change" style={{ color: locked > 0 ? "#ffd54f" : "inherit" }}>
                        {locked > 0.0001 ? locked.toFixed(8) : locked.toString()}
                      </span>
                      <span className="ep-col ep-col-hl">
                        {total > 0.0001 ? total.toFixed(8) : total.toString()}
                      </span>
                    </div>
                  );
                })}

              {funds.filter((f) => parseFloat(f.free) > 0 || parseFloat(f.locked) > 0).length === 0 && (
                <div className="exchange-loading">No assets with balance found.</div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* === ORDER HISTORY === */}
      {activeSection === "orders" && apiConnected && (
        <div className="exchange-prices-card">
          <div className="exchange-prices-header">
            <h3>Order History</h3>
            <button className="exchange-refresh-btn" onClick={fetchOrders}>
              Refresh
            </button>
          </div>

          {accountLoading && !orders ? (
            <div className="exchange-loading">Loading orders...</div>
          ) : orders ? (
            <div className="exchange-price-table">
              <div className="exchange-price-row exchange-price-row-header">
                <span className="ep-col ep-col-name">Pair</span>
                <span className="ep-col ep-col-price">Side</span>
                <span className="ep-col ep-col-change">Price</span>
                <span className="ep-col ep-col-hl">Quantity</span>
                <span className="ep-col ep-col-vol">Status</span>
                <span className="ep-col ep-col-spread">Time</span>
              </div>

              {orders.length > 0 ? (
                orders.slice(0, 50).map((o, i) => (
                  <div key={o.id || i} className="exchange-price-row">
                    <span className="ep-col ep-col-name">
                      <strong>{o.symbol?.toUpperCase()}</strong>
                    </span>
                    <span
                      className="ep-col ep-col-price"
                      style={{ color: o.side === "buy" ? "#00e676" : "#ff5252" }}
                    >
                      {o.side?.toUpperCase()}
                    </span>
                    <span className="ep-col ep-col-change">
                      {formatPrice(parseFloat(o.price))}
                    </span>
                    <span className="ep-col ep-col-hl">{o.origQty}</span>
                    <span className="ep-col ep-col-vol">
                      <span className={`order-status order-status-${o.status?.toLowerCase()}`}>
                        {o.status}
                      </span>
                    </span>
                    <span className="ep-col ep-col-spread">
                      {o.createdTime
                        ? new Date(o.createdTime).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "---"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="exchange-loading">No orders found.</div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* === OPEN ORDERS === */}
      {activeSection === "open-orders" && apiConnected && (
        <div className="exchange-prices-card">
          <div className="exchange-prices-header">
            <h3>Open Orders</h3>
            <button className="exchange-refresh-btn" onClick={fetchOpenOrders}>
              Refresh
            </button>
          </div>

          {accountLoading && !openOrders ? (
            <div className="exchange-loading">Loading open orders...</div>
          ) : openOrders ? (
            <div className="exchange-price-table">
              <div className="exchange-price-row exchange-price-row-header">
                <span className="ep-col ep-col-name">Pair</span>
                <span className="ep-col ep-col-price">Side</span>
                <span className="ep-col ep-col-change">Price</span>
                <span className="ep-col ep-col-hl">Quantity</span>
                <span className="ep-col ep-col-vol">Type</span>
                <span className="ep-col ep-col-spread">Created</span>
              </div>

              {openOrders.length > 0 ? (
                openOrders.map((o, i) => (
                  <div key={o.id || i} className="exchange-price-row">
                    <span className="ep-col ep-col-name">
                      <strong>{o.symbol?.toUpperCase()}</strong>
                    </span>
                    <span
                      className="ep-col ep-col-price"
                      style={{ color: o.side === "buy" ? "#00e676" : "#ff5252" }}
                    >
                      {o.side?.toUpperCase()}
                    </span>
                    <span className="ep-col ep-col-change">
                      {formatPrice(parseFloat(o.price))}
                    </span>
                    <span className="ep-col ep-col-hl">{o.origQty}</span>
                    <span className="ep-col ep-col-vol">{o.type}</span>
                    <span className="ep-col ep-col-spread">
                      {o.createdTime
                        ? new Date(o.createdTime).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "---"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="exchange-loading">No open orders.</div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
