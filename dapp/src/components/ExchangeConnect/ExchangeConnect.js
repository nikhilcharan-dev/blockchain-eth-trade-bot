"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import "./ExchangeConnect.css";

const SUPPORTED_SYMBOLS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT",
  "AVAX", "TRX", "LINK", "MATIC", "SHIB", "LTC", "UNI",
];

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
  const [orderSymbol, setOrderSymbol] = useState("btcinr");
  const [connectLoading, setConnectLoading] = useState(false);

  // NEW: Order history sorting + filtering
  const [orderSort, setOrderSort] = useState({ col: "time", dir: "desc" });
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");

  // NEW: Trade form
  const [tradeSymbol, setTradeSymbol] = useState("ethinr");
  const [tradeSide, setTradeSide] = useState("buy");
  const [tradePrice, setTradePrice] = useState("");
  const [tradeQty, setTradeQty] = useState("");
  const [tradePlacing, setTradePlacing] = useState(false);
  const [tradeResult, setTradeResult] = useState(null);

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

  const fetchOrders = useCallback(async (symbol) => {
    setAccountLoading(true); setAccountError(null);
    try {
      const sym = symbol || orderSymbol;
      let body;
      if (sym === "all") {
        body = { symbols: SUPPORTED_SYMBOLS.map(s => `${s.toLowerCase()}inr`) };
      } else {
        body = { symbol: sym };
      }
      const resp = await fetch("/api/wazirx/orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) { setAccountError(err.message); }
    finally { setAccountLoading(false); }
  }, [orderSymbol]);

  const fetchOpenOrders = useCallback(async () => {
    setAccountLoading(true); setAccountError(null);
    try {
      const resp = await fetch("/api/wazirx/open-orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch open orders");
      setOpenOrders(Array.isArray(data) ? data : []);
    } catch (err) { setAccountError(err.message); }
    finally { setAccountLoading(false); }
  }, []);

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
      setTradeResult({ success: true, msg: `Order placed: ${tradeSide.toUpperCase()} ${tradeQty} @ ${tradePrice}` });
      setTradePrice(""); setTradeQty("");
    } catch (err) {
      setTradeResult({ success: false, msg: err.message });
    } finally { setTradePlacing(false); }
  };

  useEffect(() => {
    if (!apiConnected) return;
    if (activeSection === "balances" && !funds) fetchFunds();
    if (activeSection === "orders") fetchOrders();
    if (activeSection === "open-orders" && !openOrders) fetchOpenOrders();
  }, [apiConnected, activeSection, funds, openOrders, orderSymbol, fetchFunds, fetchOrders, fetchOpenOrders]);

  // Sorted + filtered orders
  const processedOrders = useMemo(() => {
    if (!orders) return [];
    let list = [...orders];

    // Status filter
    if (orderStatusFilter !== "all") {
      list = list.filter(o => (o.status || "").toLowerCase() === orderStatusFilter);
    }

    // Sort
    list.sort((a, b) => {
      let av, bv;
      switch (orderSort.col) {
        case "pair": av = a.symbol || ""; bv = b.symbol || ""; break;
        case "side": av = a.side || ""; bv = b.side || ""; break;
        case "price": av = parseFloat(a.price) || 0; bv = parseFloat(b.price) || 0; break;
        case "qty": av = parseFloat(a.origQty) || 0; bv = parseFloat(b.origQty) || 0; break;
        case "status": av = a.status || ""; bv = b.status || ""; break;
        default: av = a.createdTime || 0; bv = b.createdTime || 0;
      }
      if (typeof av === "string") return orderSort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return orderSort.dir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [orders, orderStatusFilter, orderSort]);

  const handleOrderSort = (col) => {
    if (orderSort.col === col) setOrderSort(p => ({ ...p, dir: p.dir === "asc" ? "desc" : "asc" }));
    else setOrderSort({ col, dir: "desc" });
  };
  const sArrow = (col) => orderSort.col !== col ? "" : orderSort.dir === "asc" ? " \u2191" : " \u2193";

  const sections = apiConnected
    ? [
        { id: "prices", label: "Live Prices" },
        { id: "trade", label: "Trade" },
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

      {/* === TRADE === */}
      {activeSection === "trade" && apiConnected && (
        <div className="exchange-prices-card">
          <div className="exchange-prices-header">
            <h3>Place Order</h3>
          </div>
          <div className="trade-form">
            <div className="trade-form-row">
              <div className="trade-form-group">
                <label className="trade-label">Pair</label>
                <select value={tradeSymbol} onChange={e => setTradeSymbol(e.target.value)} className="exchange-input">
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
                <input type="number" value={tradePrice} onChange={e => setTradePrice(e.target.value)}
                  className="exchange-input" placeholder="Limit price" min="0" step="any" />
              </div>
              <div className="trade-form-group">
                <label className="trade-label">Quantity</label>
                <input type="number" value={tradeQty} onChange={e => setTradeQty(e.target.value)}
                  className="exchange-input" placeholder="Amount" min="0" step="any" />
              </div>
            </div>
            {tradePrice && tradeQty && (
              <div className="trade-total">
                Total: {"\u20B9"}{(parseFloat(tradePrice) * parseFloat(tradeQty) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
            )}
            <button className={`trade-submit-btn ${tradeSide === "buy" ? "trade-submit-buy" : "trade-submit-sell"}`}
              onClick={placeOrder} disabled={tradePlacing || !tradePrice || !tradeQty}>
              {tradePlacing ? "Placing..." : `${tradeSide === "buy" ? "Buy" : "Sell"} ${tradeSymbol.replace("inr", "").toUpperCase()}`}
            </button>
            {tradeResult && (
              <div className={`trade-result ${tradeResult.success ? "trade-result-ok" : "trade-result-err"}`}>
                {tradeResult.msg}
              </div>
            )}
          </div>
        </div>
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
              <div className="exchange-price-row exchange-price-row-header">
                <span className="ep-col ep-col-name">Asset</span>
                <span className="ep-col ep-col-price">Free</span>
                <span className="ep-col ep-col-change">Locked</span>
                <span className="ep-col ep-col-hl">Total</span>
              </div>
              {funds
                .filter(f => parseFloat(f.free) > 0 || parseFloat(f.locked) > 0)
                .sort((a, b) => parseFloat(b.free) + parseFloat(b.locked) - parseFloat(a.free) - parseFloat(a.locked))
                .map(f => {
                  const free = parseFloat(f.free || 0), locked = parseFloat(f.locked || 0), total = free + locked;
                  return (
                    <div key={f.asset} className="exchange-price-row">
                      <span className="ep-col ep-col-name"><strong>{f.asset?.toUpperCase()}</strong></span>
                      <span className="ep-col ep-col-price">{free > 0.0001 ? free.toFixed(8) : free.toString()}</span>
                      <span className="ep-col ep-col-change" style={{ color: locked > 0 ? "#ffd54f" : "inherit" }}>
                        {locked > 0.0001 ? locked.toFixed(8) : locked.toString()}
                      </span>
                      <span className="ep-col ep-col-hl">{total > 0.0001 ? total.toFixed(8) : total.toString()}</span>
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

      {/* === ORDER HISTORY (enhanced) === */}
      {activeSection === "orders" && apiConnected && (
        <div className="exchange-prices-card">
          <div className="exchange-prices-header">
            <h3>Order History</h3>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <select value={orderSymbol} onChange={e => { setOrderSymbol(e.target.value); setOrders(null); }}
                className="exchange-input" style={{ width: "auto", padding: "4px 8px", fontSize: "13px" }}>
                <option value="all">All Pairs</option>
                {SUPPORTED_SYMBOLS.map(s => (
                  <option key={s} value={`${s.toLowerCase()}inr`}>{s}/INR</option>
                ))}
              </select>
              <select value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}
                className="exchange-input" style={{ width: "auto", padding: "4px 8px", fontSize: "13px" }}>
                <option value="all">All Status</option>
                <option value="done">Done</option>
                <option value="cancel">Cancelled</option>
                <option value="wait">Pending</option>
              </select>
              <button className="exchange-refresh-btn" onClick={() => fetchOrders()}>Refresh</button>
            </div>
          </div>
          {accountLoading && !orders ? (
            <div className="exchange-loading">Loading orders...</div>
          ) : orders ? (
            <div className="exchange-price-table">
              <div className="exchange-price-row exchange-price-row-header">
                <span className="ep-col ep-col-name ep-sortable" onClick={() => handleOrderSort("pair")}>Pair{sArrow("pair")}</span>
                <span className="ep-col ep-col-price ep-sortable" onClick={() => handleOrderSort("side")}>Side{sArrow("side")}</span>
                <span className="ep-col ep-col-change ep-sortable" onClick={() => handleOrderSort("price")}>Price{sArrow("price")}</span>
                <span className="ep-col ep-col-hl ep-sortable" onClick={() => handleOrderSort("qty")}>Quantity{sArrow("qty")}</span>
                <span className="ep-col ep-col-vol ep-sortable" onClick={() => handleOrderSort("status")}>Status{sArrow("status")}</span>
                <span className="ep-col ep-col-spread ep-sortable" onClick={() => handleOrderSort("time")}>Time{sArrow("time")}</span>
              </div>
              {processedOrders.length > 0 ? (
                processedOrders.slice(0, 100).map((o, i) => (
                  <div key={o.id || i} className="exchange-price-row">
                    <span className="ep-col ep-col-name"><strong>{o.symbol?.toUpperCase()}</strong></span>
                    <span className="ep-col ep-col-price" style={{ color: o.side === "buy" ? "#00e676" : "#ff5252" }}>
                      {o.side?.toUpperCase()}
                    </span>
                    <span className="ep-col ep-col-change">{formatPrice(parseFloat(o.price))}</span>
                    <span className="ep-col ep-col-hl">{o.origQty}</span>
                    <span className="ep-col ep-col-vol">
                      <span className={`order-status order-status-${o.status?.toLowerCase()}`}>{o.status}</span>
                    </span>
                    <span className="ep-col ep-col-spread">
                      {o.createdTime
                        ? new Date(o.createdTime).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
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
            <button className="exchange-refresh-btn" onClick={fetchOpenOrders}>Refresh</button>
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
                    <span className="ep-col ep-col-name"><strong>{o.symbol?.toUpperCase()}</strong></span>
                    <span className="ep-col ep-col-price" style={{ color: o.side === "buy" ? "#00e676" : "#ff5252" }}>
                      {o.side?.toUpperCase()}
                    </span>
                    <span className="ep-col ep-col-change">{formatPrice(parseFloat(o.price))}</span>
                    <span className="ep-col ep-col-hl">{o.origQty}</span>
                    <span className="ep-col ep-col-vol">{o.type}</span>
                    <span className="ep-col ep-col-spread">
                      {o.createdTime
                        ? new Date(o.createdTime).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
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
