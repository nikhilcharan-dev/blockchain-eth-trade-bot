"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { useCurrency } from "@/context/CurrencyContext";
import "./AutoTradeRange.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const SUPPORTED_SYMBOLS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT",
  "AVAX", "TRX", "LINK", "MATIC", "SHIB", "LTC", "UNI",
];

const ENGINE_INTERVAL = 15000; // 15 seconds

export default function AutoTradeRange() {
  const {
    wazirxPrices, formatPrice, formatValue, currency, pairLabel,
  } = useCurrency();

  const [ranges, setRanges] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [dailyStats, setDailyStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiConnected, setApiConnected] = useState(false);
  const [engineRunning, setEngineRunning] = useState(false);
  const [lastEngineRun, setLastEngineRun] = useState(null);
  const [engineError, setEngineError] = useState(null);

  // Form state
  const [formToken, setFormToken] = useState("ETH");
  const [formLower, setFormLower] = useState("");
  const [formUpper, setFormUpper] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formMaxTrades, setFormMaxTrades] = useState("0");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Sub-section view
  const [activeSection, setActiveSection] = useState("ranges");

  // Engine interval ref
  const engineRef = useRef(null);

  // Check WazirX connection on mount
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.settings?.hasWazirxCredentials) setApiConnected(true); })
      .catch(() => {});
  }, []);

  // Fetch ranges
  const fetchRanges = useCallback(async () => {
    try {
      const resp = await fetch("/api/trade-range");
      if (!resp.ok) return;
      const data = await resp.json();
      setRanges(data.ranges || []);
    } catch {}
    setLoading(false);
  }, []);

  // Fetch logs & stats
  const fetchLogs = useCallback(async () => {
    try {
      const resp = await fetch("/api/trade-range/logs");
      if (!resp.ok) return;
      const data = await resp.json();
      setLogs(data.logs || []);
      setStats(data.stats || null);
      setDailyStats(data.dailyStats || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchRanges();
    fetchLogs();
  }, [fetchRanges, fetchLogs]);

  // Execute engine cycle
  const runEngine = useCallback(async () => {
    setEngineError(null);
    try {
      const resp = await fetch("/api/trade-range/execute", { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) {
        setEngineError(data.error || "Engine error");
        return;
      }
      setLastEngineRun(new Date());
      // If trades were executed, refresh data
      if (data.executed && data.executed.length > 0) {
        fetchRanges();
        fetchLogs();
      }
    } catch (err) {
      setEngineError(err.message);
    }
  }, [fetchRanges, fetchLogs]);

  // Start / stop engine
  const startEngine = useCallback(() => {
    if (engineRef.current) return;
    setEngineRunning(true);
    // Run immediately
    runEngine();
    // Then every interval
    engineRef.current = setInterval(runEngine, ENGINE_INTERVAL);
  }, [runEngine]);

  const stopEngine = useCallback(() => {
    if (engineRef.current) {
      clearInterval(engineRef.current);
      engineRef.current = null;
    }
    setEngineRunning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) clearInterval(engineRef.current);
    };
  }, []);

  // Auto-start engine if there are active ranges
  useEffect(() => {
    const hasActive = ranges.some(r => r.active);
    if (hasActive && apiConnected && !engineRunning) {
      startEngine();
    } else if (!hasActive && engineRunning) {
      stopEngine();
    }
  }, [ranges, apiConnected, engineRunning, startEngine, stopEngine]);

  // Create new range
  const handleCreateRange = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    const lower = parseFloat(formLower);
    const upper = parseFloat(formUpper);
    const qty = parseFloat(formQty);

    if (isNaN(lower) || lower <= 0) { setFormError("Enter a valid lower price"); return; }
    if (isNaN(upper) || upper <= 0) { setFormError("Enter a valid upper price"); return; }
    if (upper <= lower) { setFormError("Upper price must be greater than lower price"); return; }
    if (isNaN(qty) || qty <= 0) { setFormError("Enter a valid quantity"); return; }

    // Validate quantity against holdings
    const currentPrice = wazirxPrices[formToken]?.priceInr;
    if (!currentPrice) { setFormError("Could not fetch current price for " + formToken); return; }

    setFormSubmitting(true);
    try {
      const resp = await fetch("/api/trade-range", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: formToken,
          lowerPrice: lower,
          upperPrice: upper,
          quantity: qty,
          maxTradesPerDay: parseInt(formMaxTrades) || 0,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to create range");

      setFormSuccess(`Range created for ${formToken}: Buy @ ${"\u20B9"}${lower.toLocaleString("en-IN")} / Sell @ ${"\u20B9"}${upper.toLocaleString("en-IN")}`);
      setFormLower("");
      setFormUpper("");
      setFormQty("");
      setFormMaxTrades("0");
      fetchRanges();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle range active state
  const toggleRange = async (rangeId, active) => {
    try {
      await fetch("/api/trade-range", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rangeId, active: !active }),
      });
      fetchRanges();
    } catch {}
  };

  // Delete range
  const deleteRange = async (rangeId) => {
    try {
      await fetch(`/api/trade-range?id=${rangeId}`, { method: "DELETE" });
      fetchRanges();
      fetchLogs();
    } catch {}
  };

  // Pre-fill lower/upper from current price
  const prefillPrices = () => {
    const p = wazirxPrices[formToken];
    if (!p) return;
    const price = p.priceInr;
    // Default range: -3% for lower, +3% for upper
    setFormLower((price * 0.97).toFixed(2));
    setFormUpper((price * 1.03).toFixed(2));
  };

  const currentFormPrice = wazirxPrices[formToken]?.priceInr;
  const formTotal = (parseFloat(formQty) || 0) * (currentFormPrice || 0);

  // Compute chart data
  const chartData = useMemo(() => {
    if (dailyStats.length === 0) return null;

    return {
      labels: dailyStats.map(d => {
        const dt = new Date(d.date);
        return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      }),
      datasets: [
        {
          label: "Buy Volume (INR)",
          data: dailyStats.map(d => d.buyVolume),
          borderColor: "#00e676",
          backgroundColor: "rgba(0, 230, 118, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: "#00e676",
        },
        {
          label: "Sell Volume (INR)",
          data: dailyStats.map(d => d.sellVolume),
          borderColor: "#ff5252",
          backgroundColor: "rgba(255, 82, 82, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: "#ff5252",
        },
        {
          label: "P/L (INR)",
          data: dailyStats.map(d => d.profitLoss),
          borderColor: "#a5b4fc",
          backgroundColor: "rgba(165, 180, 252, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: "#a5b4fc",
        },
      ],
    };
  }, [dailyStats]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: { color: "rgba(255,255,255,0.6)", font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.85)",
        titleColor: "#fff",
        bodyColor: "rgba(255,255,255,0.8)",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${"\u20B9"}${Math.abs(ctx.parsed.y).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "rgba(255,255,255,0.4)", font: { size: 11 } },
        grid: { color: "rgba(255,255,255,0.04)" },
      },
      y: {
        ticks: {
          color: "rgba(255,255,255,0.4)",
          font: { size: 11 },
          callback: (v) => `${"\u20B9"}${v.toLocaleString("en-IN")}`,
        },
        grid: { color: "rgba(255,255,255,0.04)" },
      },
    },
  };

  const activeRangeCount = ranges.filter(r => r.active).length;

  const sections = [
    { id: "ranges", label: "Trade Ranges" },
    { id: "logs", label: "Trade Log" },
    { id: "stats", label: "Stats & Chart" },
  ];

  if (!apiConnected) {
    return (
      <div className="atr-container">
        <div className="atr-card">
          <div className="atr-header">
            <h2 className="atr-title">Auto Trade Range</h2>
            <span className="atr-status atr-status-off">Inactive</span>
          </div>
          <p className="atr-subtitle">
            Autonomous range-based trading — set buy/sell price ranges and let the bot trade 24/7.
          </p>
          <div className="atr-notice">
            Connect your WazirX account in the WazirX tab to enable auto trading.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="atr-container">
      {/* Header Card */}
      <div className="atr-card">
        <div className="atr-header">
          <div className="atr-header-left">
            <h2 className="atr-title">Auto Trade Range</h2>
            <span className={`atr-status ${engineRunning ? "atr-status-on" : "atr-status-off"}`}>
              {engineRunning ? "Engine Running" : "Engine Stopped"}
            </span>
          </div>
          <div className="atr-header-right">
            {engineRunning ? (
              <button className="atr-engine-btn atr-engine-stop" onClick={stopEngine}>
                Stop Engine
              </button>
            ) : (
              <button
                className="atr-engine-btn atr-engine-start"
                onClick={startEngine}
                disabled={activeRangeCount === 0}
              >
                Start Engine
              </button>
            )}
          </div>
        </div>
        <p className="atr-subtitle">
          Set buy/sell price ranges — the bot monitors prices every 15s and places orders automatically.
        </p>

        {/* Quick Stats Row */}
        <div className="atr-quick-stats">
          <div className="atr-stat-item">
            <span className="atr-stat-label">Active Ranges</span>
            <span className="atr-stat-value">{activeRangeCount}</span>
          </div>
          <div className="atr-stat-item">
            <span className="atr-stat-label">Today's Trades</span>
            <span className="atr-stat-value">{stats?.todayTrades || 0}</span>
          </div>
          <div className="atr-stat-item">
            <span className="atr-stat-label">Today's P/L</span>
            <span className={`atr-stat-value ${(stats?.todayPL || 0) >= 0 ? "atr-profit" : "atr-loss"}`}>
              {(stats?.todayPL || 0) >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(stats?.todayPL || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="atr-stat-item">
            <span className="atr-stat-label">Total P/L</span>
            <span className={`atr-stat-value ${(stats?.totalPL || 0) >= 0 ? "atr-profit" : "atr-loss"}`}>
              {(stats?.totalPL || 0) >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(stats?.totalPL || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="atr-stat-item">
            <span className="atr-stat-label">Last Check</span>
            <span className="atr-stat-value atr-stat-small">
              {lastEngineRun ? lastEngineRun.toLocaleTimeString() : "---"}
            </span>
          </div>
        </div>

        {engineError && <div className="atr-error">{engineError}</div>}
      </div>

      {/* Sub-tabs */}
      <div className="atr-tabs">
        {sections.map(s => (
          <button
            key={s.id}
            className={`atr-tab ${activeSection === s.id ? "atr-tab-active" : ""}`}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* === TRADE RANGES === */}
      {activeSection === "ranges" && (
        <>
          {/* Create New Range Form */}
          <div className="atr-card">
            <h3 className="atr-card-title">Create New Range</h3>
            <form className="atr-form" onSubmit={handleCreateRange}>
              <div className="atr-form-row">
                <div className="atr-form-group">
                  <label className="atr-label">Token</label>
                  <select
                    value={formToken}
                    onChange={e => { setFormToken(e.target.value); setFormLower(""); setFormUpper(""); }}
                    className="atr-input"
                  >
                    {SUPPORTED_SYMBOLS.map(s => (
                      <option key={s} value={s}>{s}/INR</option>
                    ))}
                  </select>
                </div>
                <div className="atr-form-group">
                  <label className="atr-label">Current Price</label>
                  <div className="atr-current-price">
                    {currentFormPrice ? formatPrice(currentFormPrice) : "---"}
                    <button type="button" className="atr-autofill-btn" onClick={prefillPrices}>
                      Auto-fill +-3%
                    </button>
                  </div>
                </div>
              </div>
              <div className="atr-form-row">
                <div className="atr-form-group">
                  <label className="atr-label">Lower Price (Buy Trigger) INR</label>
                  <input
                    type="number"
                    value={formLower}
                    onChange={e => setFormLower(e.target.value)}
                    className="atr-input"
                    placeholder="Buy when price drops to..."
                    min="0"
                    step="any"
                  />
                </div>
                <div className="atr-form-group">
                  <label className="atr-label">Upper Price (Sell Trigger) INR</label>
                  <input
                    type="number"
                    value={formUpper}
                    onChange={e => setFormUpper(e.target.value)}
                    className="atr-input"
                    placeholder="Sell when price rises to..."
                    min="0"
                    step="any"
                  />
                </div>
              </div>
              <div className="atr-form-row">
                <div className="atr-form-group">
                  <label className="atr-label">Quantity per Trade</label>
                  <input
                    type="number"
                    value={formQty}
                    onChange={e => setFormQty(e.target.value)}
                    className="atr-input"
                    placeholder={`Amount of ${formToken}`}
                    min="0"
                    step="any"
                  />
                  {formTotal > 0 && (
                    <span className="atr-form-hint">
                      Approx. value: {"\u20B9"}{formTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
                <div className="atr-form-group">
                  <label className="atr-label">Max Trades/Day (0 = unlimited)</label>
                  <input
                    type="number"
                    value={formMaxTrades}
                    onChange={e => setFormMaxTrades(e.target.value)}
                    className="atr-input"
                    placeholder="0"
                    min="0"
                    step="1"
                  />
                </div>
              </div>

              {/* Range preview */}
              {formLower && formUpper && parseFloat(formUpper) > parseFloat(formLower) && (
                <div className="atr-range-preview">
                  <div className="atr-range-bar">
                    <div className="atr-range-marker atr-range-lower">
                      <span className="atr-range-marker-label">Buy</span>
                      <span className="atr-range-marker-price">{"\u20B9"}{parseFloat(formLower).toLocaleString("en-IN")}</span>
                    </div>
                    <div className="atr-range-fill" />
                    {currentFormPrice && (
                      <div
                        className="atr-range-current"
                        style={{
                          left: `${Math.min(100, Math.max(0,
                            ((currentFormPrice - parseFloat(formLower)) / (parseFloat(formUpper) - parseFloat(formLower))) * 100
                          ))}%`,
                        }}
                      >
                        <span className="atr-range-current-dot" />
                        <span className="atr-range-current-label">Now</span>
                      </div>
                    )}
                    <div className="atr-range-marker atr-range-upper">
                      <span className="atr-range-marker-label">Sell</span>
                      <span className="atr-range-marker-price">{"\u20B9"}{parseFloat(formUpper).toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                  <div className="atr-range-spread">
                    Spread: {"\u20B9"}{(parseFloat(formUpper) - parseFloat(formLower)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    {" "}({(((parseFloat(formUpper) - parseFloat(formLower)) / parseFloat(formLower)) * 100).toFixed(2)}%)
                  </div>
                </div>
              )}

              <div className="atr-form-actions">
                <button
                  type="submit"
                  className="atr-submit-btn"
                  disabled={formSubmitting || !formLower || !formUpper || !formQty}
                >
                  {formSubmitting ? "Creating..." : "Create Trade Range"}
                </button>
              </div>

              {formError && <div className="atr-form-error">{formError}</div>}
              {formSuccess && <div className="atr-form-success">{formSuccess}</div>}
            </form>
          </div>

          {/* Active Ranges List */}
          <div className="atr-card">
            <div className="atr-card-header">
              <h3 className="atr-card-title">Active Ranges ({ranges.length})</h3>
              <button className="atr-refresh-btn" onClick={fetchRanges}>Refresh</button>
            </div>

            {loading ? (
              <div className="atr-loading">Loading trade ranges...</div>
            ) : ranges.length === 0 ? (
              <div className="atr-empty">No trade ranges configured yet. Create one above to get started.</div>
            ) : (
              <div className="atr-ranges-list">
                {ranges.map(range => {
                  const p = wazirxPrices[range.token];
                  const currentPrice = p?.priceInr || 0;
                  const inRange = currentPrice >= range.lowerPrice && currentPrice <= range.upperPrice;
                  const belowRange = currentPrice < range.lowerPrice;
                  const aboveRange = currentPrice > range.upperPrice;

                  // Position indicator (0-100%)
                  const position = currentPrice > 0
                    ? Math.min(100, Math.max(0,
                        ((currentPrice - range.lowerPrice) / (range.upperPrice - range.lowerPrice)) * 100
                      ))
                    : 50;

                  return (
                    <div key={range._id} className={`atr-range-item ${!range.active ? "atr-range-inactive" : ""}`}>
                      <div className="atr-range-item-header">
                        <div className="atr-range-item-left">
                          <strong className="atr-range-token">{range.token}</strong>
                          <span className={`atr-range-badge ${range.active ? "atr-badge-active" : "atr-badge-paused"}`}>
                            {range.active ? "Active" : "Paused"}
                          </span>
                          {belowRange && <span className="atr-range-signal atr-signal-buy">Buy Zone</span>}
                          {aboveRange && <span className="atr-range-signal atr-signal-sell">Sell Zone</span>}
                          {inRange && <span className="atr-range-signal atr-signal-wait">In Range</span>}
                        </div>
                        <div className="atr-range-item-actions">
                          <button
                            className={`atr-toggle-btn ${range.active ? "atr-toggle-pause" : "atr-toggle-resume"}`}
                            onClick={() => toggleRange(range._id, range.active)}
                          >
                            {range.active ? "Pause" : "Resume"}
                          </button>
                          <button className="atr-delete-btn" onClick={() => deleteRange(range._id)}>
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="atr-range-details">
                        <div className="atr-range-detail">
                          <span className="atr-detail-label">Buy @</span>
                          <span className="atr-detail-value atr-profit">{"\u20B9"}{range.lowerPrice.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="atr-range-detail">
                          <span className="atr-detail-label">Sell @</span>
                          <span className="atr-detail-value atr-loss">{"\u20B9"}{range.upperPrice.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="atr-range-detail">
                          <span className="atr-detail-label">Qty</span>
                          <span className="atr-detail-value">{range.quantity} {range.token}</span>
                        </div>
                        <div className="atr-range-detail">
                          <span className="atr-detail-label">Now</span>
                          <span className="atr-detail-value">{currentPrice ? formatPrice(currentPrice) : "---"}</span>
                        </div>
                        <div className="atr-range-detail">
                          <span className="atr-detail-label">Buys</span>
                          <span className="atr-detail-value">{range.totalBuys}</span>
                        </div>
                        <div className="atr-range-detail">
                          <span className="atr-detail-label">Sells</span>
                          <span className="atr-detail-value">{range.totalSells}</span>
                        </div>
                        <div className="atr-range-detail">
                          <span className="atr-detail-label">P/L</span>
                          <span className={`atr-detail-value ${range.totalProfitLoss >= 0 ? "atr-profit" : "atr-loss"}`}>
                            {range.totalProfitLoss >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(range.totalProfitLoss).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Mini range bar */}
                      <div className="atr-mini-range">
                        <div className="atr-mini-range-bar">
                          <div
                            className="atr-mini-range-indicator"
                            style={{ left: `${position}%` }}
                          />
                        </div>
                        <div className="atr-mini-range-labels">
                          <span>{"\u20B9"}{range.lowerPrice.toLocaleString("en-IN")}</span>
                          <span>{"\u20B9"}{range.upperPrice.toLocaleString("en-IN")}</span>
                        </div>
                      </div>

                      {range.lastAction && (
                        <div className="atr-range-last-action">
                          Last: {range.lastAction.toUpperCase()} at {new Date(range.lastActionAt).toLocaleString("en-IN")}
                        </div>
                      )}
                      {range.maxTradesPerDay > 0 && (
                        <div className="atr-range-limit">
                          Daily limit: {range.maxTradesPerDay} trades/day
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* === TRADE LOG === */}
      {activeSection === "logs" && (
        <div className="atr-card">
          <div className="atr-card-header">
            <h3 className="atr-card-title">Trade Execution Log</h3>
            <button className="atr-refresh-btn" onClick={fetchLogs}>Refresh</button>
          </div>

          {logs.length === 0 ? (
            <div className="atr-empty">No trades executed yet. The bot will log trades here as they happen.</div>
          ) : (
            <div className="atr-log-list">
              <div className="atr-log-row atr-log-header">
                <span className="atr-log-col atr-log-col-time">Time</span>
                <span className="atr-log-col atr-log-col-token">Token</span>
                <span className="atr-log-col atr-log-col-side">Side</span>
                <span className="atr-log-col atr-log-col-price">Price</span>
                <span className="atr-log-col atr-log-col-qty">Qty</span>
                <span className="atr-log-col atr-log-col-total">Total</span>
                <span className="atr-log-col atr-log-col-status">Status</span>
                <span className="atr-log-col atr-log-col-pl">P/L</span>
              </div>
              {logs.map(log => (
                <div key={log._id} className={`atr-log-row ${log.status === "failed" ? "atr-log-failed" : ""}`}>
                  <span className="atr-log-col atr-log-col-time">
                    {new Date(log.createdAt).toLocaleString("en-IN", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </span>
                  <span className="atr-log-col atr-log-col-token">
                    <strong>{log.token}</strong>
                  </span>
                  <span className={`atr-log-col atr-log-col-side ${log.side === "buy" ? "atr-profit" : "atr-loss"}`}>
                    {log.side.toUpperCase()}
                  </span>
                  <span className="atr-log-col atr-log-col-price">
                    {"\u20B9"}{log.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                  <span className="atr-log-col atr-log-col-qty">{log.quantity}</span>
                  <span className="atr-log-col atr-log-col-total">
                    {"\u20B9"}{log.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                  <span className={`atr-log-col atr-log-col-status atr-status-${log.status}`}>
                    {log.status}
                  </span>
                  <span className={`atr-log-col atr-log-col-pl ${(log.profitLoss || 0) >= 0 ? "atr-profit" : "atr-loss"}`}>
                    {log.profitLoss ? `${log.profitLoss >= 0 ? "+" : ""}${"\u20B9"}${Math.abs(log.profitLoss).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "---"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === STATS & CHART === */}
      {activeSection === "stats" && (
        <>
          {/* Stats Summary */}
          <div className="atr-card">
            <h3 className="atr-card-title">Trading Statistics</h3>
            <div className="atr-stats-grid">
              <div className="atr-stats-box">
                <span className="atr-stats-box-label">Today's Trades</span>
                <span className="atr-stats-box-value">{stats?.todayTrades || 0}</span>
                <div className="atr-stats-box-sub">
                  <span className="atr-profit">{stats?.todayBuys || 0} buys</span>
                  <span className="atr-loss">{stats?.todaySells || 0} sells</span>
                </div>
              </div>
              <div className="atr-stats-box">
                <span className="atr-stats-box-label">Today's P/L</span>
                <span className={`atr-stats-box-value ${(stats?.todayPL || 0) >= 0 ? "atr-profit" : "atr-loss"}`}>
                  {(stats?.todayPL || 0) >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(stats?.todayPL || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="atr-stats-box">
                <span className="atr-stats-box-label">All-Time Trades</span>
                <span className="atr-stats-box-value">{stats?.totalTrades || 0}</span>
                <div className="atr-stats-box-sub">
                  <span className="atr-profit">{stats?.totalBuys || 0} buys</span>
                  <span className="atr-loss">{stats?.totalSells || 0} sells</span>
                </div>
              </div>
              <div className="atr-stats-box">
                <span className="atr-stats-box-label">All-Time P/L</span>
                <span className={`atr-stats-box-value ${(stats?.totalPL || 0) >= 0 ? "atr-profit" : "atr-loss"}`}>
                  {(stats?.totalPL || 0) >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(stats?.totalPL || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="atr-card">
            <div className="atr-card-header">
              <h3 className="atr-card-title">Daily Trade Volume & P/L (30 Days)</h3>
              <button className="atr-refresh-btn" onClick={fetchLogs}>Refresh</button>
            </div>
            {chartData ? (
              <div className="atr-chart-container">
                <Line data={chartData} options={chartOptions} />
              </div>
            ) : (
              <div className="atr-empty">
                No trade data yet. The chart will populate as the bot executes trades.
              </div>
            )}
          </div>

          {/* Daily breakdown table */}
          {dailyStats.length > 0 && (
            <div className="atr-card">
              <h3 className="atr-card-title">Daily Breakdown</h3>
              <div className="atr-daily-table">
                <div className="atr-daily-row atr-daily-header">
                  <span>Date</span>
                  <span>Trades</span>
                  <span>Buys</span>
                  <span>Sells</span>
                  <span>Buy Vol</span>
                  <span>Sell Vol</span>
                  <span>P/L</span>
                </div>
                {[...dailyStats].reverse().map(d => (
                  <div key={d.date} className="atr-daily-row">
                    <span>{new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                    <span>{d.trades}</span>
                    <span className="atr-profit">{d.buys}</span>
                    <span className="atr-loss">{d.sells}</span>
                    <span>{"\u20B9"}{d.buyVolume.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                    <span>{"\u20B9"}{d.sellVolume.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                    <span className={d.profitLoss >= 0 ? "atr-profit" : "atr-loss"}>
                      {d.profitLoss >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(d.profitLoss).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
