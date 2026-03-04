"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useCurrency } from "@/context/CurrencyContext";

const ALERTS_KEY = "price_alerts";
const ALERT_LOG_KEY = "price_alert_log";

const COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT", "AVAX", "LINK"];

function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY)) || []; } catch { return []; }
}
function loadLog() {
  try { return JSON.parse(localStorage.getItem(ALERT_LOG_KEY)) || []; } catch { return []; }
}

function WidgetContent({ selectedCoin, setSelectedCoin, onClose }) {
  const { wazirxPrices, formatPrice, currencySymbol, convert, currency } = useCurrency();
  const [alerts, setAlerts] = useState([]);
  const [log, setLog] = useState([]);
  const [flash, setFlash] = useState(null);
  const prevPriceRef = useRef(null);

  useEffect(() => {
    setAlerts(loadAlerts());
    setLog(loadLog());
    const iv = setInterval(() => {
      setAlerts(loadAlerts());
      setLog(loadLog());
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  const coin = wazirxPrices[selectedCoin];
  const price = coin?.priceInr;
  const change = coin?.change;
  const high = coin?.highInr;
  const low = coin?.lowInr;
  const vol = coin?.volume;

  useEffect(() => {
    if (price && prevPriceRef.current !== null && prevPriceRef.current !== price) {
      setFlash(price > prevPriceRef.current ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(t);
    }
    prevPriceRef.current = price;
  }, [price]);

  const activeAlerts = alerts.filter(a => a.active && a.symbol === selectedCoin);
  const recentLog = log.slice(-5).reverse();

  return (
    <div className="fw-root">
      <div className="fw-header">
        <div className="fw-title-row">
          <span className="fw-logo">CryptoDash</span>
          <button className="fw-close" onClick={onClose} title="Close widget">&times;</button>
        </div>
        <div className="fw-coin-selector">
          {COINS.map(c => (
            <button
              key={c}
              className={`fw-coin-btn ${selectedCoin === c ? "fw-coin-active" : ""}`}
              onClick={() => setSelectedCoin(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="fw-body">
        <div className="fw-price-card">
          <div className="fw-pair">{selectedCoin}/INR</div>
          <div className={`fw-price ${flash === "up" ? "fw-flash-up" : flash === "down" ? "fw-flash-down" : ""}`}>
            {price ? formatPrice(price) : "---"}
          </div>
          <div className={`fw-change ${change >= 0 ? "fw-positive" : "fw-negative"}`}>
            {change !== undefined ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "--"}
            <span className="fw-change-label">24h</span>
          </div>
        </div>

        <div className="fw-stats-grid">
          <div className="fw-stat">
            <span className="fw-stat-label">24h High</span>
            <span className="fw-stat-value">{high ? formatPrice(high) : "---"}</span>
          </div>
          <div className="fw-stat">
            <span className="fw-stat-label">24h Low</span>
            <span className="fw-stat-value">{low ? formatPrice(low) : "---"}</span>
          </div>
          <div className="fw-stat">
            <span className="fw-stat-label">Volume</span>
            <span className="fw-stat-value">{vol ? vol.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "---"}</span>
          </div>
          <div className="fw-stat">
            <span className="fw-stat-label">Spread</span>
            <span className="fw-stat-value">
              {coin?.bidPriceInr && coin?.askPriceInr
                ? formatPrice(coin.askPriceInr - coin.bidPriceInr)
                : "---"}
            </span>
          </div>
        </div>

        {activeAlerts.length > 0 && (
          <div className="fw-section">
            <div className="fw-section-title">Active Alerts</div>
            {activeAlerts.map(a => (
              <div key={a.id} className="fw-alert-row">
                <span className={`fw-alert-icon ${a.condition === "above" ? "fw-alert-up" : "fw-alert-down"}`}>
                  {a.condition === "above" ? "\u2191" : "\u2193"}
                </span>
                <span>{formatPrice(a.price)}</span>
              </div>
            ))}
          </div>
        )}

        {recentLog.length > 0 && (
          <div className="fw-section">
            <div className="fw-section-title">Recent Alerts</div>
            {recentLog.map((entry, i) => (
              <div key={i} className={`fw-log-row ${entry.type === "anomaly" ? "fw-log-anomaly" : ""}`}>
                <strong>{entry.symbol}</strong>
                <span className="fw-log-msg">
                  {entry.message || `${entry.condition === "above" ? "Above" : "Below"} ${formatPrice(entry.target)}`}
                </span>
                <span className="fw-log-time">
                  {new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fw-footer">
        <span className="fw-feed-dot" />
        Live &middot; {currency}
      </div>
    </div>
  );
}

const WIDGET_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{margin:0;padding:0;background:#0d0d11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e0e0e0;overflow:hidden}
.fw-root{display:flex;flex-direction:column;height:100vh;width:100%;overflow:hidden}
.fw-header{background:linear-gradient(135deg,#12121a 0%,#1a1a2e 100%);padding:10px 14px 8px;border-bottom:1px solid rgba(255,255,255,0.06)}
.fw-title-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.fw-logo{font-size:13px;font-weight:700;background:linear-gradient(135deg,#00e5ff,#7c4dff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:.5px}
.fw-close{background:none;border:none;color:rgba(255,255,255,0.4);font-size:18px;cursor:pointer;padding:0 4px;line-height:1}
.fw-close:hover{color:#ff5252}
.fw-coin-selector{display:flex;flex-wrap:wrap;gap:4px}
.fw-coin-btn{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:rgba(255,255,255,0.5);font-size:10px;padding:3px 7px;cursor:pointer;transition:all .2s}
.fw-coin-btn:hover{background:rgba(255,255,255,0.08);color:#fff}
.fw-coin-active{background:rgba(0,229,255,0.12);border-color:rgba(0,229,255,0.3);color:#00e5ff;font-weight:600}
.fw-body{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:12px}
.fw-body::-webkit-scrollbar{width:4px}
.fw-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}
.fw-price-card{text-align:center;padding:14px 0 10px;border-bottom:1px solid rgba(255,255,255,0.05)}
.fw-pair{font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px}
.fw-price{font-size:28px;font-weight:700;color:#fff;transition:color .3s}
.fw-flash-up{color:#00e676 !important}
.fw-flash-down{color:#ff5252 !important}
.fw-change{font-size:14px;font-weight:600;margin-top:4px;display:inline-flex;align-items:center;gap:6px}
.fw-positive{color:#00e676}
.fw-negative{color:#ff5252}
.fw-change-label{font-size:10px;color:rgba(255,255,255,0.3);font-weight:400}
.fw-stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fw-stat{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}
.fw-stat-label{font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:.5px}
.fw-stat-value{font-size:13px;font-weight:600;color:#e0e0e0}
.fw-section{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:10px}
.fw-section-title{font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;font-weight:600}
.fw-alert-row{display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px}
.fw-alert-icon{font-weight:700;font-size:13px}
.fw-alert-up{color:#00e676}
.fw-alert-down{color:#ff5252}
.fw-log-row{display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11px;border-bottom:1px solid rgba(255,255,255,0.03)}
.fw-log-row:last-child{border-bottom:none}
.fw-log-row strong{color:#00e5ff;font-size:10px;min-width:34px}
.fw-log-msg{flex:1;color:rgba(255,255,255,0.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fw-log-time{color:rgba(255,255,255,0.25);font-size:10px;white-space:nowrap}
.fw-log-anomaly{background:rgba(255,152,0,0.06);border-radius:4px;padding:4px 6px}
.fw-footer{padding:8px 14px;border-top:1px solid rgba(255,255,255,0.06);font-size:10px;color:rgba(255,255,255,0.3);display:flex;align-items:center;gap:6px}
.fw-feed-dot{width:6px;height:6px;border-radius:50%;background:#00e676;animation:fw-pulse 2s infinite}
@keyframes fw-pulse{0%,100%{opacity:1}50%{opacity:.3}}
`;

export default function FloatingWidget({ active, onClose }) {
  const [pipWindow, setPipWindow] = useState(null);
  const [portalContainer, setPortalContainer] = useState(null);
  const [selectedCoin, setSelectedCoin] = useState("ETH");
  const closingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPipWindow(null);
    setPortalContainer(null);
    onClose();
    setTimeout(() => { closingRef.current = false; }, 100);
  }, [onClose]);

  // Open PiP / popup window
  useEffect(() => {
    if (!active) {
      if (pipWindow) {
        try { pipWindow.close(); } catch {}
        setPipWindow(null);
        setPortalContainer(null);
      }
      return;
    }

    if (pipWindow) return;

    let win = null;

    const openWindow = async () => {
      closingRef.current = false;

      // Try Document Picture-in-Picture API first (Chrome 116+)
      if ("documentPictureInPicture" in window) {
        try {
          win = await window.documentPictureInPicture.requestWindow({
            width: 380,
            height: 520,
          });
        } catch {
          win = null;
        }
      }

      // Fallback to popup
      if (!win) {
        const left = window.screen.width - 400;
        win = window.open(
          "",
          "CryptoDashWidget",
          `width=380,height=520,top=60,left=${left},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
        );
      }

      if (!win) {
        cleanup();
        return;
      }

      // Inject styles
      const style = win.document.createElement("style");
      style.textContent = WIDGET_CSS;
      win.document.head.appendChild(style);
      win.document.title = "CryptoDash - Live Ticker";

      // Create portal container
      const container = win.document.createElement("div");
      container.id = "fw-portal";
      win.document.body.appendChild(container);

      // Listen for close
      win.addEventListener("pagehide", cleanup);

      setPipWindow(win);
      setPortalContainer(container);
    };

    openWindow();

    return () => {
      if (win) {
        try { win.removeEventListener("pagehide", cleanup); } catch {}
      }
    };
  }, [active, pipWindow, cleanup]);

  const handleClose = useCallback(() => {
    if (pipWindow) {
      try { pipWindow.close(); } catch {}
    }
    cleanup();
  }, [pipWindow, cleanup]);

  if (!portalContainer) return null;

  return createPortal(
    <WidgetContent
      selectedCoin={selectedCoin}
      setSelectedCoin={setSelectedCoin}
      onClose={handleClose}
    />,
    portalContainer
  );
}
