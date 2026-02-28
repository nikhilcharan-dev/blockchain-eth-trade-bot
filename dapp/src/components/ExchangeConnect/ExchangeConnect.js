"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import "./ExchangeConnect.css";

const SUPPORTED_SYMBOLS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT",
  "AVAX", "TRX", "LINK", "MATIC", "SHIB", "LTC", "UNI",
];

const ALERTS_KEY = "price_alerts";

function addPriceAlert(symbol, price, condition) {
  try {
    const existing = JSON.parse(localStorage.getItem(ALERTS_KEY)) || [];
    existing.push({
      id: Date.now() + Math.random(),
      symbol: symbol.toUpperCase(),
      price,
      condition,
      active: true,
    });
    localStorage.setItem(ALERTS_KEY, JSON.stringify(existing));
  } catch {}
}

export default function ExchangeConnect() {
  const {
    wazirxPrices, loading, lastUpdated,
    formatPrice, formatVolume, pairLabel, currency,
  } = useCurrency();

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiSecretInput, setApiSecretInput] = useState("");
  const [apiConnected, setApiConnected] = useState(false);

  const [funds, setFunds] = useState(null);
  const [orders, setOrders] = useState(null);
  const [openOrders, setOpenOrders] = useState(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState(null);

  const [activeSection, setActiveSection] = useState("prices");
  const [connectLoading, setConnectLoading] = useState(false);

  // Trade form
  const [tradeSymbol, setTradeSymbol] = useState("ethinr");
  const [tradeSide, setTradeSide] = useState("buy");
  const [tradePrice, setTradePrice] = useState("");
  const [tradeQty, setTradeQty] = useState("");
  const [tradePlacing, setTradePlacing] = useState(false);
  const [tradeResult, setTradeResult] = useState(null);
  const [autoAlert, setAutoAlert] = useState(true);

  // Token-wise order view
  const [expandedTokens, setExpandedTokens] = useState(new Set());
  const [cancellingId, setCancellingId] = useState(null);
  const [orderSearch, setOrderSearch] = useState("");

  // Auto-refresh timer
  const refreshRef = useRef(null);

  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.settings?.hasWazirxCredentials) setApiConnected(true); })
      .catch(() => {});
  }, []);

  const connectApi = async () => {
    const key = apiKeyInput.trim(), secret = apiSecretInput.trim();
    if (!key || !secret) return;
    setConnectLoading(true);
    try {
      const resp = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wazirxApiKey: key, wazirxApiSecret: secret, syncEnabled: true }),
      });
      if (resp.ok) { setApiConnected(true); setApiKeyInput(""); setApiSecretInput(""); }
      else setAccountError("Failed to save credentials");
    } catch { setAccountError("Failed to save credentials"); }
    finally { setConnectLoading(false); }
  };

  const disconnectApi = async () => {
    try {
      await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wazirxApiKey: "", wazirxApiSecret: "" }),
      });
    } catch {}
    setApiConnected(false); setFunds(null); setOrders(null); setOpenOrders(null); setAccountError(null);
  };

  const fetchFunds = useCallback(async () => {
    setAccountLoading(true); setAccountError(null);
    try {
      const resp = await fetch("/api/wazirx/funds", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch funds");
      setFunds(data);
    } catch (err) { setAccountError(err.message); }
    finally { setAccountLoading(false); }
  }, []);

  const fetchAllOrders = useCallback(async () => {
    setAccountLoading(true); setAccountError(null);
    try {
      const body = { symbols: SUPPORTED_SYMBOLS.map(s => `${s.toLowerCase()}inr`) };
      const resp = await fetch("/api/wazirx/orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) { setAccountError(err.message); }
    finally { setAccountLoading(false); }
  }, []);

  const fetchOpenOrders = useCallback(async () => {
    try {
      const resp = await fetch("/api/wazirx/open-orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch open orders");
      setOpenOrders(Array.isArray(data) ? data : []);
    } catch (err) { setAccountError(err.message); }
  }, []);

  // Cancel an order
  const cancelOrder = async (symbol, orderId) => {
    setCancellingId(orderId);
    try {
      const resp = await fetch("/api/wazirx/cancel-order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, orderId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Cancel failed");
      // Refresh open orders
      await fetchOpenOrders();
      setTradeResult({ success: true, msg: `Order #${orderId} cancelled` });
    } catch (err) {
      setTradeResult({ success: false, msg: err.message });
    } finally { setCancellingId(null); }
  };

  // Place order
  const placeOrder = async () => {
    if (!tradePrice || !tradeQty) return;
    setTradePlacing(true); setTradeResult(null);
    try {
      const resp = await fetch("/api/wazirx/place-order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: tradeSymbol,
          side: tradeSide,
          type: "limit",
          price: tradePrice,
          quantity: tradeQty,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Order failed");

      const tokenName = tradeSymbol.replace("inr", "").toUpperCase();
      setTradeResult({ success: true, msg: `${tradeSide.toUpperCase()} ${tradeQty} ${tokenName} @ \u20B9${parseFloat(tradePrice).toLocaleString("en-IN")}` });

      // Auto-create price alert
      if (autoAlert) {
        const prc = parseFloat(tradePrice);
        if (tradeSide === "buy") {
          addPriceAlert(tokenName, prc, "below");
        } else {
          addPriceAlert(tokenName, prc, "above");
        }
      }

      setTradePrice(""); setTradeQty("");
      // Refresh open orders
      fetchOpenOrders();
      fetchAllOrders();
    } catch (err) {
      setTradeResult({ success: false, msg: err.message });
    } finally { setTradePlacing(false); }
  };

  // Pre-fill price from live data
  const prefillPrice = useCallback(() => {
    const token = tradeSymbol.replace("inr", "").toUpperCase();
    const p = wazirxPrices[token];
    if (p) setTradePrice(String(p.priceInr));
  }, [tradeSymbol, wazirxPrices]);

  // Load data when section changes
  useEffect(() => {
    if (!apiConnected) return;
    if (activeSection === "balances" && !funds) fetchFunds();
    if (activeSection === "orders") {
      if (!orders) fetchAllOrders();
      if (!openOrders) fetchOpenOrders();
    }
  }, [apiConnected, activeSection, funds, orders, openOrders, fetchFunds, fetchAllOrders, fetchOpenOrders]);

  // Auto-refresh open orders every 30s when on orders tab
  useEffect(() => {
    if (activeSection === "orders" && apiConnected) {
      refreshRef.current = setInterval(() => {
        fetchOpenOrders();
      }, 30000);
      return () => clearInterval(refreshRef.current);
    }
  }, [activeSection, apiConnected, fetchOpenOrders]);

  // Build token-wise grouped data
  const tokenGroups = useMemo(() => {
    const groups = {};

    // Process all orders (history)
    if (orders) {
      for (const o of orders) {
        const sym = (o.symbol || "").replace(/inr$/i, "").toUpperCase();
        if (!sym) continue;
        if (!groups[sym]) groups[sym] = { token: sym, open: [], filled: [], cancelled: [] };
        const status = (o.status || "").toLowerCase();
        if (status === "done" || status === "filled") {
          groups[sym].filled.push(o);
        } else if (status === "cancel" || status === "cancelled") {
          groups[sym].cancelled.push(o);
        }
      }
    }

    // Process open orders
    if (openOrders) {
      for (const o of openOrders) {
        const sym = (o.symbol || "").replace(/inr$/i, "").toUpperCase();
        if (!sym) continue;
        if (!groups[sym]) groups[sym] = { token: sym, open: [], filled: [], cancelled: [] };
        groups[sym].open.push(o);
      }
    }

    // Convert to sorted array
    let arr = Object.values(groups)
      .filter(g => g.open.length > 0 || g.filled.length > 0)
      .sort((a, b) => {
        // Tokens with open orders first, then by name
        if (a.open.length > 0 && b.open.length === 0) return -1;
        if (b.open.length > 0 && a.open.length === 0) return 1;
        return a.token.localeCompare(b.token);
      });

    // Apply search filter
    if (orderSearch) {
      const q = orderSearch.toUpperCase();
      arr = arr.filter(g => g.token.includes(q));
    }

    return arr;
  }, [orders, openOrders, orderSearch]);

  const toggleToken = (token) => {
    setExpandedTokens(prev => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  // Compute P/L for a single order
  const getOrderPL = (order) => {
    const sym = (order.symbol || "").replace(/inr$/i, "").toUpperCase();
    const p = wazirxPrices[sym];
    if (!p) return null;
    const currentPrice = p.priceInr;
    const orderPrice = parseFloat(order.price) || 0;
    const qty = parseFloat(order.executedQty || order.origQty) || 0;
    if (!orderPrice || !qty) return null;

    const side = (order.side || "").toLowerCase();
    let pl, plPct;
    if (side === "buy") {
      pl = (currentPrice - orderPrice) * qty;
      plPct = ((currentPrice - orderPrice) / orderPrice) * 100;
    } else {
      pl = (orderPrice - currentPrice) * qty;
      plPct = ((orderPrice - currentPrice) / currentPrice) * 100;
    }
    return { pl, plPct, currentPrice };
  };

  // Token group summary P/L
  const getTokenSummary = (group) => {
    const p = wazirxPrices[group.token];
    const currentPrice = p?.priceInr || 0;

    let totalBuyQty = 0, totalBuyCost = 0;
    let totalSellQty = 0, totalSellRevenue = 0;

    for (const o of group.filled) {
      const price = parseFloat(o.price) || 0;
      const qty = parseFloat(o.executedQty) || parseFloat(o.origQty) || 0;
      if (price <= 0 || qty <= 0) continue;
      if (o.side === "buy") {
        totalBuyQty += qty;
        totalBuyCost += price * qty;
      } else {
        totalSellQty += qty;
        totalSellRevenue += price * qty;
      }
    }

    const netQty = totalBuyQty - totalSellQty;
    const avgBuy = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
    const holdingValue = netQty > 0 ? netQty * currentPrice : 0;
    const holdingCost = netQty > 0 ? netQty * avgBuy : 0;
    const unrealizedPL = holdingValue - holdingCost;
    const realizedPL = totalSellRevenue - (totalSellQty * avgBuy);

    return {
      currentPrice,
      avgBuy,
      netQty,
      holdingValue,
      unrealizedPL,
      realizedPL,
      totalOrders: group.filled.length + group.open.length,
      openCount: group.open.length,
    };
  };

  const sections = apiConnected
    ? [
        { id: "prices", label: "Live Prices" },
        { id: "orders", label: "Trade & Orders" },
        { id: "balances", label: "Wallet" },
      ]
    : [{ id: "prices", label: "Live Prices" }];

  const tradeToken = tradeSymbol.replace("inr", "").toUpperCase();
  const tradeCurrentPrice = wazirxPrices[tradeToken]?.priceInr;
  const tradeTotal = (parseFloat(tradePrice) || 0) * (parseFloat(tradeQty) || 0);

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
              <input type="password" placeholder="WazirX API Key" value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)} className="exchange-input" />
              <input type="password" placeholder="WazirX API Secret" value={apiSecretInput}
                onChange={e => setApiSecretInput(e.target.value)} className="exchange-input" />
              <button className="exchange-connect-btn" onClick={connectApi} disabled={connectLoading}>
                {connectLoading ? "Connecting..." : "Connect Account"}
              </button>
            </div>
            <p className="exchange-note">
              Your credentials are encrypted and stored securely on the server. They are used server-side for request signing and never exposed to the browser.
            </p>
          </div>
        ) : (
          <div className="exchange-connected-info">
            <p className="exchange-connected-text">
              Account connected. API requests are signed server-side via Next.js API routes.
            </p>
            <button className="exchange-disconnect-btn" onClick={disconnectApi}>Disconnect</button>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="exchange-tabs">
        {sections.map(s => (
          <button key={s.id}
            className={`exchange-tab ${activeSection === s.id ? "exchange-tab-active" : ""}`}
            onClick={() => setActiveSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {accountError && <div className="exchange-error">{accountError}</div>}

      {/* === LIVE PRICES === */}
      {activeSection === "prices" && (
        <div className="exchange-prices-card">
          <div className="exchange-prices-header">
            <h3>WazirX Live Prices ({currency})</h3>
            {lastUpdated && (
              <span className="exchange-last-updated">Updated: {lastUpdated.toLocaleTimeString()}</span>
            )}
          </div>
          {loading ? (
            <div className="exchange-loading">Loading WazirX prices...</div>
          ) : (
            <div className="exchange-price-table">
              <div className="exchange-price-row exchange-price-row-header">
                <span className="ep-col ep-col-name">Token</span>
                <span className="ep-col ep-col-price">Price</span>
                <span className="ep-col ep-col-change">24h Change</span>
                <span className="ep-col ep-col-hl">24h High / Low</span>
                <span className="ep-col ep-col-vol">Volume</span>
                <span className="ep-col ep-col-spread">Bid / Ask</span>
              </div>
              {SUPPORTED_SYMBOLS.map(symbol => {
                const d = wazirxPrices[symbol];
                if (!d) return null;
                const changeClass = d.change >= 0 ? "ep-change-up" : "ep-change-down";
                return (
                  <div key={symbol} className="exchange-price-row">
                    <span className="ep-col ep-col-name"><strong>{symbol}</strong><span className="ep-pair">{pairLabel}</span></span>
                    <span className="ep-col ep-col-price">{formatPrice(d.priceInr)}</span>
                    <span className={`ep-col ep-col-change ${changeClass}`}>{d.change >= 0 ? "+" : ""}{d.change?.toFixed(2)}%</span>
                    <span className="ep-col ep-col-hl">{formatPrice(d.highInr)} / {formatPrice(d.lowInr)}</span>
                    <span className="ep-col ep-col-vol">{formatVolume(d.quoteVolumeInr)}</span>
                    <span className="ep-col ep-col-spread">{formatPrice(d.bidPriceInr)} / {formatPrice(d.askPriceInr)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === TRADE & ORDERS === */}
      {activeSection === "orders" && apiConnected && (
        <>
          {/* Quick Order Form */}
          <div className="exchange-prices-card">
            <div className="exchange-prices-header">
              <h3>Place Order</h3>
              {tradeCurrentPrice && (
                <span className="exchange-last-updated">
                  {tradeToken} Now: {formatPrice(tradeCurrentPrice)}
                </span>
              )}
            </div>
            <div className="trade-form">
              <div className="trade-form-row">
                <div className="trade-form-group">
                  <label className="trade-label">Pair</label>
                  <select value={tradeSymbol} onChange={e => { setTradeSymbol(e.target.value); setTradePrice(""); }} className="exchange-input">
                    {SUPPORTED_SYMBOLS.map(s => (
                      <option key={s} value={`${s.toLowerCase()}inr`}>{s}/INR</option>
                    ))}
                  </select>
                </div>
                <div className="trade-form-group">
                  <label className="trade-label">Side</label>
                  <div className="trade-side-toggle">
                    <button className={`trade-side-btn trade-side-buy ${tradeSide === "buy" ? "trade-side-active-buy" : ""}`}
                      onClick={() => setTradeSide("buy")}>Buy</button>
                    <button className={`trade-side-btn trade-side-sell ${tradeSide === "sell" ? "trade-side-active-sell" : ""}`}
                      onClick={() => setTradeSide("sell")}>Sell</button>
                  </div>
                </div>
              </div>
              <div className="trade-form-row">
                <div className="trade-form-group">
                  <label className="trade-label">Price (INR)</label>
                  <div className="trade-price-wrap">
                    <input type="number" value={tradePrice} onChange={e => setTradePrice(e.target.value)}
                      className="exchange-input" placeholder="Limit price" min="0" step="any" />
                    <button className="trade-mkt-btn" onClick={prefillPrice} title="Use current market price">Mkt</button>
                  </div>
                </div>
                <div className="trade-form-group">
                  <label className="trade-label">Quantity</label>
                  <input type="number" value={tradeQty} onChange={e => setTradeQty(e.target.value)}
                    className="exchange-input" placeholder="Amount" min="0" step="any" />
                </div>
              </div>
              {tradeTotal > 0 && (
                <div className="trade-total">
                  Total: {"\u20B9"}{tradeTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </div>
              )}
              <div className="trade-form-row trade-form-actions">
                <label className="trade-auto-alert">
                  <input type="checkbox" checked={autoAlert} onChange={e => setAutoAlert(e.target.checked)} />
                  <span>Auto-create price alert</span>
                </label>
                <button className={`trade-submit-btn ${tradeSide === "buy" ? "trade-submit-buy" : "trade-submit-sell"}`}
                  onClick={placeOrder} disabled={tradePlacing || !tradePrice || !tradeQty}>
                  {tradePlacing ? "Placing..." : `${tradeSide === "buy" ? "Buy" : "Sell"} ${tradeToken}`}
                </button>
              </div>
              {tradeResult && (
                <div className={`trade-result ${tradeResult.success ? "trade-result-ok" : "trade-result-err"}`}>
                  {tradeResult.msg}
                </div>
              )}
            </div>
          </div>

          {/* Token-wise Order View */}
          <div className="exchange-prices-card">
            <div className="exchange-prices-header">
              <h3>Orders by Token</h3>
              <div className="orders-header-actions">
                <input type="text" placeholder="Search token..." value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)} className="exchange-input orders-search" />
                <button className="exchange-refresh-btn" onClick={() => { fetchAllOrders(); fetchOpenOrders(); }}>Refresh</button>
              </div>
            </div>

            {accountLoading && !orders ? (
              <div className="exchange-loading">Loading orders...</div>
            ) : tokenGroups.length > 0 ? (
              <div className="token-order-groups">
                {tokenGroups.map(group => {
                  const summary = getTokenSummary(group);
                  const isExpanded = expandedTokens.has(group.token);
                  const p = wazirxPrices[group.token];
                  const change = p?.change;

                  return (
                    <div key={group.token} className={`token-group ${isExpanded ? "token-group-expanded" : ""}`}>
                      {/* Token Header Row */}
                      <div className="token-group-header" onClick={() => toggleToken(group.token)}>
                        <div className="token-group-left">
                          <span className="token-group-expand">{isExpanded ? "\u25BC" : "\u25B6"}</span>
                          <strong className="token-group-name">{group.token}</strong>
                          {group.open.length > 0 && (
                            <span className="token-open-badge">{group.open.length} open</span>
                          )}
                          {change !== undefined && (
                            <span className={`token-change ${change >= 0 ? "ep-change-up" : "ep-change-down"}`}>
                              {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                            </span>
                          )}
                        </div>
                        <div className="token-group-right">
                          <div className="token-summary-item">
                            <span className="token-summary-label">Price</span>
                            <span className="token-summary-value">{summary.currentPrice ? formatPrice(summary.currentPrice) : "---"}</span>
                          </div>
                          <div className="token-summary-item">
                            <span className="token-summary-label">Avg Buy</span>
                            <span className="token-summary-value">{summary.avgBuy > 0 ? formatPrice(summary.avgBuy) : "---"}</span>
                          </div>
                          <div className="token-summary-item">
                            <span className="token-summary-label">Holdings</span>
                            <span className="token-summary-value">{summary.netQty > 0 ? summary.netQty.toFixed(6) : "0"}</span>
                          </div>
                          <div className="token-summary-item">
                            <span className="token-summary-label">P/L</span>
                            <span className={`token-summary-value ${summary.unrealizedPL > 0 ? "pl-profit" : summary.unrealizedPL < 0 ? "pl-loss" : ""}`}>
                              {summary.unrealizedPL !== 0
                                ? `${summary.unrealizedPL > 0 ? "+" : ""}${"\u20B9"}${Math.abs(summary.unrealizedPL).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                                : "---"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="token-group-body">
                          {/* Open Orders */}
                          {group.open.length > 0 && (
                            <div className="token-order-section">
                              <h4 className="token-section-title">Open Orders</h4>
                              <div className="token-orders-list">
                                {group.open.map(o => {
                                  const pl = getOrderPL(o);
                                  return (
                                    <div key={o.id} className="token-order-row open-order-row">
                                      <div className="token-order-info">
                                        <span className={`order-side-tag ${o.side === "buy" ? "side-buy" : "side-sell"}`}>
                                          {o.side?.toUpperCase()}
                                        </span>
                                        <span className="order-detail">
                                          {o.origQty} @ {formatPrice(parseFloat(o.price))}
                                        </span>
                                        <span className="order-type-tag">{o.type}</span>
                                      </div>
                                      <div className="token-order-actions">
                                        {pl && (
                                          <span className={`order-pl ${pl.pl >= 0 ? "pl-profit" : "pl-loss"}`}>
                                            {pl.pl >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(pl.pl).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                            <small> ({pl.plPct >= 0 ? "+" : ""}{pl.plPct.toFixed(2)}%)</small>
                                          </span>
                                        )}
                                        <button
                                          className="order-cancel-btn"
                                          onClick={(e) => { e.stopPropagation(); cancelOrder(o.symbol, o.id); }}
                                          disabled={cancellingId === o.id}
                                        >
                                          {cancellingId === o.id ? "..." : "Cancel"}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Filled Orders */}
                          {group.filled.length > 0 && (
                            <div className="token-order-section">
                              <h4 className="token-section-title">Filled Orders</h4>
                              <div className="token-orders-list">
                                {group.filled.slice(0, 20).map((o, i) => {
                                  const pl = getOrderPL(o);
                                  return (
                                    <div key={o.id || i} className="token-order-row">
                                      <div className="token-order-info">
                                        <span className={`order-side-tag ${o.side === "buy" ? "side-buy" : "side-sell"}`}>
                                          {o.side?.toUpperCase()}
                                        </span>
                                        <span className="order-detail">
                                          {o.executedQty || o.origQty} @ {formatPrice(parseFloat(o.price))}
                                        </span>
                                        <span className="order-time">
                                          {o.createdTime
                                            ? new Date(o.createdTime).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                                            : ""}
                                        </span>
                                      </div>
                                      <div className="token-order-actions">
                                        {pl && (
                                          <span className={`order-pl ${pl.pl >= 0 ? "pl-profit" : "pl-loss"}`}>
                                            {pl.pl >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(pl.pl).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                            <small> ({pl.plPct >= 0 ? "+" : ""}{pl.plPct.toFixed(2)}%)</small>
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                {group.filled.length > 20 && (
                                  <div className="token-more-orders">+{group.filled.length - 20} more</div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Quick Trade from this token */}
                          <div className="token-quick-trade">
                            <button className="token-trade-btn trade-submit-buy"
                              onClick={() => { setTradeSymbol(`${group.token.toLowerCase()}inr`); setTradeSide("buy"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                              Buy {group.token}
                            </button>
                            <button className="token-trade-btn trade-submit-sell"
                              onClick={() => { setTradeSymbol(`${group.token.toLowerCase()}inr`); setTradeSide("sell"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                              Sell {group.token}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : orders ? (
              <div className="exchange-loading">No orders found. Place your first order above!</div>
            ) : null}
          </div>
        </>
      )}

      {/* === WALLET BALANCES === */}
      {activeSection === "balances" && apiConnected && (
        <div className="exchange-prices-card">
          <div className="exchange-prices-header">
            <h3>Wallet Balances</h3>
            <button className="exchange-refresh-btn" onClick={fetchFunds}>Refresh</button>
          </div>
          {accountLoading && !funds ? (
            <div className="exchange-loading">Loading wallet...</div>
          ) : funds ? (
            <div className="exchange-price-table">
              <div className="exchange-price-row exchange-price-row-header" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr" }}>
                <span className="ep-col ep-col-name">Asset</span>
                <span className="ep-col ep-col-price">Free</span>
                <span className="ep-col ep-col-change">Locked</span>
                <span className="ep-col ep-col-hl">Total</span>
                <span className="ep-col ep-col-spread">Value</span>
              </div>
              {funds
                .filter(f => parseFloat(f.free) > 0 || parseFloat(f.locked) > 0)
                .sort((a, b) => {
                  const aName = (a.asset || "").toUpperCase();
                  const bName = (b.asset || "").toUpperCase();
                  const aP = wazirxPrices[aName]?.priceInr || 0;
                  const bP = wazirxPrices[bName]?.priceInr || 0;
                  const aVal = (parseFloat(a.free) + parseFloat(a.locked)) * aP;
                  const bVal = (parseFloat(b.free) + parseFloat(b.locked)) * bP;
                  return bVal - aVal;
                })
                .map(f => {
                  const free = parseFloat(f.free || 0), locked = parseFloat(f.locked || 0), total = free + locked;
                  const name = (f.asset || "").toUpperCase();
                  const price = wazirxPrices[name]?.priceInr || 0;
                  const value = total * price;
                  return (
                    <div key={f.asset} className="exchange-price-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr" }}>
                      <span className="ep-col ep-col-name"><strong>{name}</strong></span>
                      <span className="ep-col ep-col-price">{free > 0.0001 ? free.toFixed(8) : free.toString()}</span>
                      <span className="ep-col ep-col-change" style={{ color: locked > 0 ? "#ffd54f" : "inherit" }}>
                        {locked > 0.0001 ? locked.toFixed(8) : locked.toString()}
                      </span>
                      <span className="ep-col ep-col-hl">{total > 0.0001 ? total.toFixed(8) : total.toString()}</span>
                      <span className="ep-col ep-col-spread">{value > 0 ? formatPrice(value) : "---"}</span>
                    </div>
                  );
                })}
              {funds.filter(f => parseFloat(f.free) > 0 || parseFloat(f.locked) > 0).length === 0 && (
                <div className="exchange-loading">No assets with balance found.</div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
