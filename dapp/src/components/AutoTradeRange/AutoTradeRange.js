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

const TOKEN_COLORS = {
  BTC: "#f7931a", ETH: "#627eea", SOL: "#9945ff", XRP: "#00aae4",
  BNB: "#f3ba2f", ADA: "#0033ad", DOGE: "#c2a633", DOT: "#e6007a",
  AVAX: "#e84142", TRX: "#eb0029", LINK: "#2a5ada", MATIC: "#8247e5",
  SHIB: "#ffa409", LTC: "#bfbbbb", UNI: "#ff007a",
};

const ENGINE_INTERVAL = 15000;

const getRelativeTime = (date) => {
  const now = new Date();
  const diff = now - new Date(date);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const formatBadgeCount = (count) => count > 99 ? "99+" : count;

export default function AutoTradeRange() {
  const { wazirxPrices, formatPrice } = useCurrency();

  const [ranges, setRanges] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [dailyStats, setDailyStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiConnected, setApiConnected] = useState(false);
  const [engineRunning, setEngineRunning] = useState(false);
  const [lastEngineRun, setLastEngineRun] = useState(null);
  const [engineError, setEngineError] = useState(null);

  const [formToken, setFormToken] = useState("ETH");
  const [formLower, setFormLower] = useState("");
  const [formUpper, setFormUpper] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formMaxTrades, setFormMaxTrades] = useState("0");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [activeSection, setActiveSection] = useState("ranges");
  const [expandedRange, setExpandedRange] = useState(null);

  const engineRef = useRef(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.settings?.hasWazirxCredentials) setApiConnected(true); })
      .catch(() => {});
  }, []);

  const fetchRanges = useCallback(async () => {
    try {
      const resp = await fetch("/api/trade-range");
      if (!resp.ok) return;
      const data = await resp.json();
      setRanges(data.ranges || []);
    } catch {}
    setLoading(false);
  }, []);

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
      if (data.executed && data.executed.length > 0) {
        fetchRanges();
        fetchLogs();
      }
    } catch (err) {
      setEngineError(err.message);
    }
  }, [fetchRanges, fetchLogs]);

  const startEngine = useCallback(() => {
    if (engineRef.current) return;
    setEngineRunning(true);
    runEngine();
    engineRef.current = setInterval(runEngine, ENGINE_INTERVAL);
  }, [runEngine]);

  const stopEngine = useCallback(() => {
    if (engineRef.current) {
      clearInterval(engineRef.current);
      engineRef.current = null;
    }
    setEngineRunning(false);
  }, []);

  useEffect(() => {
    return () => {
      if (engineRef.current) clearInterval(engineRef.current);
    };
  }, []);

  useEffect(() => {
    const hasActive = ranges.some(r => r.active);
    if (hasActive && apiConnected && !engineRunning) {
      startEngine();
    } else if (!hasActive && engineRunning) {
      stopEngine();
    }
  }, [ranges, apiConnected, engineRunning, startEngine, stopEngine]);

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

      setFormSuccess(`Range created for ${formToken}: Buy @ \u20B9${lower.toLocaleString("en-IN")} / Sell @ \u20B9${upper.toLocaleString("en-IN")}`);
      setFormLower("");
      setFormUpper("");
      setFormQty("");
      setFormMaxTrades("0");
      fetchRanges();
      setTimeout(() => setFormSuccess(""), 5000);
    } catch (err) {
      setFormError(err.message);
      setTimeout(() => setFormError(""), 8000);
    } finally {
      setFormSubmitting(false);
    }
  };

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

  const deleteRange = async (rangeId) => {
    if (!window.confirm("Delete this trade range? This cannot be undone.")) return;
    try {
      await fetch(`/api/trade-range?id=${rangeId}`, { method: "DELETE" });
      fetchRanges();
      fetchLogs();
    } catch {}
  };

  const prefillPrices = () => {
    const p = wazirxPrices[formToken];
    if (!p) return;
    const price = p.priceInr;
    setFormLower((price * 0.97).toFixed(2));
    setFormUpper((price * 1.03).toFixed(2));
  };

  const currentFormPrice = wazirxPrices[formToken]?.priceInr;
  const formTotal = (parseFloat(formQty) || 0) * (currentFormPrice || 0);

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
          backgroundColor: "rgba(0, 230, 118, 0.08)",
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: "#00e676",
          borderWidth: 2,
        },
        {
          label: "Sell Volume (INR)",
          data: dailyStats.map(d => d.sellVolume),
          borderColor: "#ff5252",
          backgroundColor: "rgba(255, 82, 82, 0.08)",
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: "#ff5252",
          borderWidth: 2,
        },
        {
          label: "P/L (INR)",
          data: dailyStats.map(d => d.profitLoss),
          borderColor: "#a5b4fc",
          backgroundColor: "rgba(165, 180, 252, 0.08)",
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: "#a5b4fc",
          borderWidth: 2,
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
        position: "top",
        align: "end",
        labels: {
          color: "rgba(255,255,255,0.5)",
          font: { size: 11 },
          boxWidth: 8,
          boxHeight: 8,
          borderRadius: 4,
          useBorderRadius: true,
          padding: 16,
        },
      },
      tooltip: {
        backgroundColor: "rgba(10, 10, 10, 0.95)",
        titleColor: "#fff",
        bodyColor: "rgba(255,255,255,0.8)",
        borderColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        callbacks: {
          label: (ctx) => `  ${ctx.dataset.label}: \u20B9${Math.abs(ctx.parsed.y).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "rgba(255,255,255,0.3)", font: { size: 10 }, maxRotation: 0 },
        grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
        border: { display: false },
      },
      y: {
        ticks: {
          color: "rgba(255,255,255,0.3)",
          font: { size: 10 },
          callback: (v) => `\u20B9${v.toLocaleString("en-IN")}`,
        },
        grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
        border: { display: false },
      },
    },
  };

  const activeRangeCount = ranges.filter(r => r.active).length;

  const winRate = useMemo(() => {
    if (!stats?.totalTrades) return 0;
    const sells = stats.totalSells || 0;
    if (!sells) return 0;
    const profitableSells = logs.filter(l => l.side === "sell" && (l.profitLoss || 0) > 0).length;
    return sells > 0 ? Math.round((profitableSells / sells) * 100) : 0;
  }, [stats, logs]);

  const sections = [
    { id: "ranges", label: "Trade Ranges", icon: "grid" },
    { id: "logs", label: "Trade Log", icon: "list" },
    { id: "stats", label: "Analytics", icon: "chart" },
  ];

  if (!apiConnected) {
    return (
      <div className="at-container">
        <div className="at-offline-card">
          <div className="at-offline-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2 className="at-offline-title">Auto Trade</h2>
          <p className="at-offline-text">
            Connect your WazirX exchange account to enable autonomous range-based trading.
            The bot will monitor prices and execute trades 24/7 within your defined ranges.
          </p>
          <div className="at-offline-hint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            Go to the WazirX tab to connect your API keys
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="at-container">
      {/* ═══ COMMAND CENTER HEADER ═══ */}
      <div className="at-command-center">
        <div className="at-cc-top">
          <div className="at-cc-identity">
            <div className={`at-engine-orb ${engineRunning ? "at-orb-active" : "at-orb-idle"}`}>
              <div className="at-orb-core" />
              {engineRunning && <div className="at-orb-ring" />}
              {engineRunning && <div className="at-orb-ring at-orb-ring-2" />}
            </div>
            <div className="at-cc-title-group">
              <h2 className="at-cc-title">Auto Trade</h2>
              <span className={`at-cc-status ${engineRunning ? "at-cc-status-live" : ""}`}>
                {engineRunning ? "Engine Live" : "Engine Idle"}
              </span>
            </div>
          </div>
          <div className="at-cc-controls">
            {lastEngineRun && (
              <span className="at-cc-last-check">
                Last scan: {lastEngineRun.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button
              className={`at-engine-toggle ${engineRunning ? "at-engine-toggle-stop" : "at-engine-toggle-start"}`}
              onClick={engineRunning ? stopEngine : startEngine}
              disabled={!engineRunning && activeRangeCount === 0}
            >
              <span className="at-toggle-dot" />
              {engineRunning ? "Stop" : "Start"}
            </button>
          </div>
        </div>

        {engineError && (
          <div className="at-cc-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {engineError}
          </div>
        )}

        {/* Stats Row */}
        <div className="at-metrics-row">
          <div className="at-metric">
            <div className="at-metric-icon at-metric-icon-ranges">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              </svg>
            </div>
            <div className="at-metric-data">
              <span className="at-metric-value">{activeRangeCount}</span>
              <span className="at-metric-label">Active</span>
            </div>
          </div>
          <div className="at-metric-divider" />
          <div className="at-metric">
            <div className="at-metric-icon at-metric-icon-trades">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
            <div className="at-metric-data">
              <span className="at-metric-value">{stats?.todayTrades || 0}</span>
              <span className="at-metric-label">Today</span>
            </div>
          </div>
          <div className="at-metric-divider" />
          <div className="at-metric">
            <div className="at-metric-icon at-metric-icon-pl">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div className="at-metric-data">
              <span className={`at-metric-value ${(stats?.todayPL || 0) >= 0 ? "at-text-green" : "at-text-red"}`}>
                {(stats?.todayPL || 0) >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(stats?.todayPL || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
              <span className="at-metric-label">Today P/L</span>
            </div>
          </div>
          <div className="at-metric-divider" />
          <div className="at-metric">
            <div className="at-metric-icon at-metric-icon-total">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </div>
            <div className="at-metric-data">
              <span className={`at-metric-value ${(stats?.totalPL || 0) >= 0 ? "at-text-green" : "at-text-red"}`}>
                {(stats?.totalPL || 0) >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(stats?.totalPL || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
              <span className="at-metric-label">Total P/L</span>
            </div>
          </div>
          <div className="at-metric-divider" />
          <div className="at-metric">
            <div className="at-metric-icon at-metric-icon-win">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <div className="at-metric-data">
              <span className="at-metric-value">{winRate}%</span>
              <span className="at-metric-label">Win Rate</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SECTION TABS ═══ */}
      <div className="at-nav">
        {sections.map(s => (
          <button
            key={s.id}
            className={`at-nav-tab ${activeSection === s.id ? "at-nav-tab-active" : ""}`}
            onClick={() => setActiveSection(s.id)}
          >
            <span className="at-nav-tab-label">{s.label}</span>
            {s.id === "ranges" && ranges.length > 0 && (
              <span className="at-nav-badge">{formatBadgeCount(ranges.length)}</span>
            )}
            {s.id === "logs" && logs.length > 0 && (
              <span className="at-nav-badge">{formatBadgeCount(logs.length)}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TRADE RANGES SECTION ═══ */}
      {activeSection === "ranges" && (
        <div className="at-ranges-section">
          {/* Create Range Toggle + Form */}
          <div className="at-create-wrapper">
            <button
              className={`at-create-toggle ${showForm ? "at-create-toggle-open" : ""}`}
              onClick={() => setShowForm(!showForm)}
            >
              <span className="at-create-toggle-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span>New Trade Range</span>
              <svg className="at-create-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showForm && (
              <div className="at-form-card">
              <form className="at-form" onSubmit={handleCreateRange}>
                <div className="at-form-grid">
                  <div className="at-form-group">
                    <label className="at-label">Token</label>
                    <select
                      value={formToken}
                      onChange={e => { setFormToken(e.target.value); setFormLower(""); setFormUpper(""); }}
                      className="at-select"
                    >
                      {SUPPORTED_SYMBOLS.map(s => (
                        <option key={s} value={s}>{s}/INR</option>
                      ))}
                    </select>
                  </div>
                  <div className="at-form-group">
                    <label className="at-label">Current Price</label>
                    <div className="at-price-display">
                      <span className="at-price-value">
                        {currentFormPrice ? formatPrice(currentFormPrice) : "---"}
                      </span>
                      <button type="button" className="at-autofill" onClick={prefillPrices} title="Auto-fill ±3% range">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zM15.5 15.5L19 19" />
                        </svg>
                        ±3%
                      </button>
                    </div>
                  </div>
                  <div className="at-form-group">
                    <label className="at-label">
                      <span className="at-label-dot at-dot-green" />
                      Buy Trigger (INR)
                    </label>
                    <input
                      type="number"
                      value={formLower}
                      onChange={e => { setFormLower(e.target.value); setFormError(""); }}
                      className="at-input"
                      placeholder="Buy when price drops to..."
                      min="0"
                      step="any"
                    />
                  </div>
                  <div className="at-form-group">
                    <label className="at-label">
                      <span className="at-label-dot at-dot-red" />
                      Sell Trigger (INR)
                    </label>
                    <input
                      type="number"
                      value={formUpper}
                      onChange={e => { setFormUpper(e.target.value); setFormError(""); }}
                      className="at-input"
                      placeholder="Sell when price rises to..."
                      min="0"
                      step="any"
                    />
                  </div>
                  <div className="at-form-group">
                    <label className="at-label">Quantity per Trade</label>
                    <input
                      type="number"
                      value={formQty}
                      onChange={e => { setFormQty(e.target.value); setFormError(""); }}
                      className="at-input"
                      placeholder={`Amount of ${formToken}`}
                      min="0"
                      step="any"
                    />
                    {formTotal > 0 && (
                      <span className="at-form-hint">
                        ~{"\u20B9"}{formTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  <div className="at-form-group">
                    <label className="at-label">Max Trades/Day</label>
                    <input
                      type="number"
                      value={formMaxTrades}
                      onChange={e => setFormMaxTrades(e.target.value)}
                      className="at-input"
                      placeholder="0 = unlimited"
                      min="0"
                      step="1"
                    />
                  </div>
                </div>

                {/* Range preview */}
                {formLower && formUpper && parseFloat(formUpper) > parseFloat(formLower) && (
                  <div className="at-preview">
                    <div className="at-preview-bar">
                      <div className="at-preview-track">
                        <div className="at-preview-fill" />
                        {currentFormPrice && (
                          <div
                            className="at-preview-cursor"
                            style={{
                              left: `${Math.min(100, Math.max(0,
                                ((currentFormPrice - parseFloat(formLower)) / (parseFloat(formUpper) - parseFloat(formLower))) * 100
                              ))}%`,
                            }}
                          />
                        )}
                      </div>
                      <div className="at-preview-labels">
                        <span className="at-text-green">{"\u20B9"}{parseFloat(formLower).toLocaleString("en-IN")}</span>
                        {currentFormPrice && <span className="at-preview-now">Now</span>}
                        <span className="at-text-red">{"\u20B9"}{parseFloat(formUpper).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                    <div className="at-preview-spread">
                      Spread: {"\u20B9"}{(parseFloat(formUpper) - parseFloat(formLower)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      {" "}({(((parseFloat(formUpper) - parseFloat(formLower)) / parseFloat(formLower)) * 100).toFixed(2)}%)
                    </div>
                  </div>
                )}

                <div className="at-form-footer">
                  {formError && <div className="at-form-error">{formError}</div>}
                  {formSuccess && <div className="at-form-success">{formSuccess}</div>}
                  <button
                    type="submit"
                    className="at-submit"
                    disabled={formSubmitting || !formLower || !formUpper || !formQty}
                  >
                    {formSubmitting ? (
                      <span className="at-submit-loading">Creating...</span>
                    ) : (
                      <>Create Range</>
                    )}
                  </button>
                </div>
              </form>
            </div>
            )}
          </div>

          {/* Active Ranges */}
          {loading ? (
            <div className="at-loading">
              <div className="at-loading-spinner" />
              <span>Loading trade ranges...</span>
            </div>
          ) : ranges.length === 0 ? (
            <div className="at-empty-state">
              <div className="at-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
              <h3>No Trade Ranges</h3>
              <p>Create your first range to start autonomous trading.</p>
              {!showForm && (
                <button className="at-empty-cta" onClick={() => setShowForm(true)}>
                  Create Trade Range
                </button>
              )}
            </div>
          ) : (
            <div className="at-ranges-grid">
              {ranges.map(range => {
                const p = wazirxPrices[range.token];
                const currentPrice = p?.priceInr || 0;
                const belowRange = currentPrice < range.lowerPrice;
                const aboveRange = currentPrice > range.upperPrice;

                const position = currentPrice > 0
                  ? Math.min(100, Math.max(0,
                      ((currentPrice - range.lowerPrice) / (range.upperPrice - range.lowerPrice)) * 100
                    ))
                  : 50;

                const signal = belowRange ? "buy" : aboveRange ? "sell" : "hold";
                const tokenColor = TOKEN_COLORS[range.token] || "#6366f1";
                const isExpanded = expandedRange === range._id;

                return (
                  <div
                    key={range._id}
                    className={`at-range-card ${!range.active ? "at-range-paused" : ""} ${signal === "buy" ? "at-range-signal-buy" : signal === "sell" ? "at-range-signal-sell" : ""}`}
                  >
                    {/* Card Header */}
                    <div className="at-range-head">
                      <div className="at-range-identity">
                        <div className="at-token-badge" style={{ background: `${tokenColor}20`, color: tokenColor, borderColor: `${tokenColor}40` }}>
                          {range.token}
                        </div>
                        <div className="at-range-status-group">
                          {range.active ? (
                            <span className="at-range-live">Active</span>
                          ) : (
                            <span className="at-range-idle">Paused</span>
                          )}
                          {signal === "buy" && <span className="at-signal at-signal-buy">BUY</span>}
                          {signal === "sell" && <span className="at-signal at-signal-sell">SELL</span>}
                          {signal === "hold" && range.active && <span className="at-signal at-signal-hold">HOLD</span>}
                        </div>
                      </div>
                      <div className="at-range-actions">
                        <button
                          className={`at-action-btn ${range.active ? "at-action-pause" : "at-action-resume"}`}
                          onClick={() => toggleRange(range._id, range.active)}
                          title={range.active ? "Pause" : "Resume"}
                        >
                          {range.active ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          )}
                        </button>
                        <button
                          className="at-action-btn at-action-delete"
                          onClick={() => deleteRange(range._id)}
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Price Bar */}
                    <div className="at-range-bar-wrap">
                      <div className="at-range-bar">
                        <div className="at-range-bar-fill" />
                        <div
                          className={`at-range-bar-dot ${signal === "buy" ? "at-bar-dot-buy" : signal === "sell" ? "at-bar-dot-sell" : "at-bar-dot-hold"}`}
                          style={{ left: `${position}%` }}
                        />
                      </div>
                      <div className="at-range-bar-prices">
                        <span className="at-text-green">{"\u20B9"}{range.lowerPrice.toLocaleString("en-IN")}</span>
                        <span className="at-range-current-price">
                          {currentPrice ? formatPrice(currentPrice) : "---"}
                        </span>
                        <span className="at-text-red">{"\u20B9"}{range.upperPrice.toLocaleString("en-IN")}</span>
                      </div>
                    </div>

                    {/* Key Stats */}
                    <div className="at-range-stats">
                      <div className="at-range-stat">
                        <span className="at-range-stat-val">{range.quantity} {range.token}</span>
                        <span className="at-range-stat-lbl">Qty</span>
                      </div>
                      <div className="at-range-stat">
                        <span className="at-range-stat-val">{range.totalBuys}</span>
                        <span className="at-range-stat-lbl">Buys</span>
                      </div>
                      <div className="at-range-stat">
                        <span className="at-range-stat-val">{range.totalSells}</span>
                        <span className="at-range-stat-lbl">Sells</span>
                      </div>
                      <div className="at-range-stat">
                        <span className={`at-range-stat-val ${range.totalProfitLoss >= 0 ? "at-text-green" : "at-text-red"}`}>
                          {range.totalProfitLoss >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(range.totalProfitLoss).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </span>
                        <span className="at-range-stat-lbl">P/L</span>
                      </div>
                    </div>

                    {/* Expandable Details */}
                    <button className="at-range-expand" onClick={() => setExpandedRange(isExpanded ? null : range._id)}>
                      <span>{isExpanded ? "Less" : "Details"}</span>
                      <svg className={`at-expand-icon ${isExpanded ? "at-expand-open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="at-range-details">
                        {range.lastAction && (
                          <div className="at-range-detail-row">
                            <span className="at-detail-label">Last Action</span>
                            <span className={`at-detail-value ${range.lastAction === "buy" ? "at-text-green" : "at-text-red"}`}>
                              {range.lastAction.toUpperCase()} - {getRelativeTime(range.lastActionAt)}
                            </span>
                          </div>
                        )}
                        {range.maxTradesPerDay > 0 && (
                          <div className="at-range-detail-row">
                            <span className="at-detail-label">Daily Limit</span>
                            <span className="at-detail-value">{range.maxTradesPerDay} trades/day</span>
                          </div>
                        )}
                        <div className="at-range-detail-row">
                          <span className="at-detail-label">Spread</span>
                          <span className="at-detail-value">
                            {"\u20B9"}{(range.upperPrice - range.lowerPrice).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            {" "}({(((range.upperPrice - range.lowerPrice) / range.lowerPrice) * 100).toFixed(2)}%)
                          </span>
                        </div>
                        <div className="at-range-detail-row">
                          <span className="at-detail-label">Created</span>
                          <span className="at-detail-value">{new Date(range.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TRADE LOG SECTION ═══ */}
      {activeSection === "logs" && (
        <div className="at-logs-section">
          <div className="at-section-header">
            <h3 className="at-section-title">Trade Execution Log</h3>
            <button className="at-refresh" onClick={fetchLogs}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Refresh
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="at-empty-state">
              <div className="at-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <h3>No Trades Yet</h3>
              <p>Trades will appear here as the engine executes them automatically.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="at-log-table-wrap">
                <div className="at-log-table">
                  <div className="at-log-row at-log-row-header">
                    <span className="at-log-cell at-log-time">Time</span>
                    <span className="at-log-cell at-log-token">Token</span>
                    <span className="at-log-cell at-log-side">Side</span>
                    <span className="at-log-cell at-log-price">Price</span>
                    <span className="at-log-cell at-log-qty">Qty</span>
                    <span className="at-log-cell at-log-total">Total</span>
                    <span className="at-log-cell at-log-status">Status</span>
                    <span className="at-log-cell at-log-pl">P/L</span>
                  </div>
                  {logs.map(log => {
                    const tokenColor = TOKEN_COLORS[log.token] || "#6366f1";
                    return (
                      <div key={log._id} className={`at-log-row ${log.status === "failed" ? "at-log-row-failed" : ""}`}>
                        <span className="at-log-cell at-log-time">
                          {new Date(log.createdAt).toLocaleString("en-IN", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                        <span className="at-log-cell at-log-token">
                          <span className="at-log-token-dot" style={{ background: tokenColor }} />
                          {log.token}
                        </span>
                        <span className={`at-log-cell at-log-side ${log.side === "buy" ? "at-text-green" : "at-text-red"}`}>
                          {log.side.toUpperCase()}
                        </span>
                        <span className="at-log-cell at-log-price">
                          {"\u20B9"}{log.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </span>
                        <span className="at-log-cell at-log-qty">{log.quantity}</span>
                        <span className="at-log-cell at-log-total">
                          {"\u20B9"}{log.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </span>
                        <span className={`at-log-cell at-log-status at-status-${log.status}`}>
                          <span className={`at-status-dot at-status-dot-${log.status}`} />
                          {log.status}
                        </span>
                        <span className={`at-log-cell at-log-pl ${(log.profitLoss || 0) >= 0 ? "at-text-green" : "at-text-red"}`}>
                          {log.profitLoss ? `${log.profitLoss >= 0 ? "+" : ""}\u20B9${Math.abs(log.profitLoss).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "---"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="at-log-cards">
                {logs.map(log => {
                  const tokenColor = TOKEN_COLORS[log.token] || "#6366f1";
                  return (
                    <div key={log._id} className={`at-log-card ${log.status === "failed" ? "at-log-card-failed" : ""}`}>
                      <div className="at-log-card-top">
                        <div className="at-log-card-left">
                          <span className="at-log-token-dot" style={{ background: tokenColor }} />
                          <strong>{log.token}</strong>
                          <span className={log.side === "buy" ? "at-text-green" : "at-text-red"}>
                            {log.side.toUpperCase()}
                          </span>
                        </div>
                        <span className={`at-log-card-pl ${(log.profitLoss || 0) >= 0 ? "at-text-green" : "at-text-red"}`}>
                          {log.profitLoss ? `${log.profitLoss >= 0 ? "+" : ""}\u20B9${Math.abs(log.profitLoss).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "---"}
                        </span>
                      </div>
                      <div className="at-log-card-details">
                        <span>{"\u20B9"}{log.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })} x {log.quantity}</span>
                        <span className={`at-status-${log.status}`}>{log.status}</span>
                      </div>
                      <div className="at-log-card-time">
                        {getRelativeTime(log.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ ANALYTICS SECTION ═══ */}
      {activeSection === "stats" && (
        <div className="at-analytics-section">
          {/* Stats Cards */}
          <div className="at-stats-cards">
            <div className="at-stat-card at-stat-card-today">
              <div className="at-stat-card-header">
                <span className="at-stat-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <span className="at-stat-card-label">Today</span>
              </div>
              <span className="at-stat-card-value">{stats?.todayTrades || 0} trades</span>
              <div className="at-stat-card-sub">
                <span className="at-text-green">{stats?.todayBuys || 0} buys</span>
                <span className="at-text-red">{stats?.todaySells || 0} sells</span>
              </div>
            </div>
            <div className="at-stat-card">
              <div className="at-stat-card-header">
                <span className="at-stat-card-icon at-stat-icon-pl">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                  </svg>
                </span>
                <span className="at-stat-card-label">Today's P/L</span>
              </div>
              <span className={`at-stat-card-value ${(stats?.todayPL || 0) >= 0 ? "at-text-green" : "at-text-red"}`}>
                {(stats?.todayPL || 0) >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(stats?.todayPL || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="at-stat-card">
              <div className="at-stat-card-header">
                <span className="at-stat-card-icon at-stat-icon-all">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                  </svg>
                </span>
                <span className="at-stat-card-label">All Time</span>
              </div>
              <span className="at-stat-card-value">{stats?.totalTrades || 0} trades</span>
              <div className="at-stat-card-sub">
                <span className="at-text-green">{stats?.totalBuys || 0} buys</span>
                <span className="at-text-red">{stats?.totalSells || 0} sells</span>
              </div>
            </div>
            <div className="at-stat-card">
              <div className="at-stat-card-header">
                <span className="at-stat-card-icon at-stat-icon-total">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </span>
                <span className="at-stat-card-label">All-Time P/L</span>
              </div>
              <span className={`at-stat-card-value ${(stats?.totalPL || 0) >= 0 ? "at-text-green" : "at-text-red"}`}>
                {(stats?.totalPL || 0) >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(stats?.totalPL || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Chart */}
          <div className="at-chart-card">
            <div className="at-section-header">
              <h3 className="at-section-title">30-Day Performance</h3>
              <button className="at-refresh" onClick={fetchLogs}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Refresh
              </button>
            </div>
            {chartData ? (
              <div className="at-chart-wrap">
                <Line data={chartData} options={chartOptions} />
              </div>
            ) : (
              <div className="at-chart-empty">
                No trade data yet. The chart will populate as the bot executes trades.
              </div>
            )}
          </div>

          {/* Daily Breakdown */}
          {dailyStats.length > 0 && (
            <div className="at-daily-card">
              <h3 className="at-section-title">Daily Breakdown</h3>
              <div className="at-daily-table-wrap">
                <div className="at-daily-table">
                  <div className="at-daily-row at-daily-row-header">
                    <span>Date</span>
                    <span>Trades</span>
                    <span>Buys</span>
                    <span>Sells</span>
                    <span>Buy Vol</span>
                    <span>Sell Vol</span>
                    <span>P/L</span>
                  </div>
                  {[...dailyStats].reverse().map(d => (
                    <div key={d.date} className="at-daily-row">
                      <span>{new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                      <span>{d.trades}</span>
                      <span className="at-text-green">{d.buys}</span>
                      <span className="at-text-red">{d.sells}</span>
                      <span>{"\u20B9"}{d.buyVolume.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                      <span>{"\u20B9"}{d.sellVolume.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                      <span className={d.profitLoss >= 0 ? "at-text-green" : "at-text-red"}>
                        {d.profitLoss >= 0 ? "+" : ""}{"\u20B9"}{Math.abs(d.profitLoss).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
