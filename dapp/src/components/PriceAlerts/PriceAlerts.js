"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import "./PriceAlerts.css";

const ALERTS_KEY = "price_alerts";
const ALERT_LOG_KEY = "price_alert_log";

function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY)) || []; } catch { return []; }
}
function saveAlerts(a) { localStorage.setItem(ALERTS_KEY, JSON.stringify(a)); }
function loadLog() {
  try { return JSON.parse(localStorage.getItem(ALERT_LOG_KEY)) || []; } catch { return []; }
}
function saveLog(l) { localStorage.setItem(ALERT_LOG_KEY, JSON.stringify(l.slice(-50))); }

export default function PriceAlerts() {
  const { wazirxPrices, formatPrice } = useCurrency();
  const [alerts, setAlerts] = useState([]);
  const [log, setLog] = useState([]);
  const [newSymbol, setNewSymbol] = useState("BTC");
  const [newPrice, setNewPrice] = useState("");
  const [newCondition, setNewCondition] = useState("above");
  const [permGranted, setPermGranted] = useState(false);
  const triggeredRef = useRef(new Set());

  useEffect(() => { setAlerts(loadAlerts()); setLog(loadLog()); }, []);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setPermGranted(true);
    }
  }, []);

  const requestPerm = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPermGranted(p === "granted");
  };

  const addAlert = () => {
    const price = parseFloat(newPrice);
    if (!newSymbol || isNaN(price) || price <= 0) return;
    const alert = {
      id: Date.now(),
      symbol: newSymbol.toUpperCase(),
      price,
      condition: newCondition,
      active: true,
    };
    const updated = [...alerts, alert];
    setAlerts(updated); saveAlerts(updated);
    setNewPrice("");
  };

  const removeAlert = (id) => {
    const updated = alerts.filter(a => a.id !== id);
    setAlerts(updated); saveAlerts(updated);
    triggeredRef.current.delete(id);
  };

  const clearLog = () => { setLog([]); saveLog([]); };

  // Check alerts against live prices
  const checkAlerts = useCallback(() => {
    const updated = [];
    let logChanged = false;
    const currentLog = loadLog();

    for (const alert of alerts) {
      if (!alert.active) { updated.push(alert); continue; }
      const p = wazirxPrices[alert.symbol];
      if (!p) { updated.push(alert); continue; }

      const current = p.priceInr;
      const triggered = alert.condition === "above" ? current >= alert.price : current <= alert.price;

      if (triggered && !triggeredRef.current.has(alert.id)) {
        triggeredRef.current.add(alert.id);

        // Browser notification
        if (permGranted && typeof Notification !== "undefined") {
          new Notification(`Price Alert: ${alert.symbol}`, {
            body: `${alert.symbol} is now ${formatPrice(current)} (${alert.condition} ${formatPrice(alert.price)})`,
            icon: "/favicon.ico",
          });
        }

        // Log it
        currentLog.push({
          symbol: alert.symbol,
          condition: alert.condition,
          target: alert.price,
          actual: current,
          time: Date.now(),
        });
        logChanged = true;

        updated.push({ ...alert, active: false });
      } else {
        updated.push(alert);
      }
    }

    if (logChanged) {
      saveLog(currentLog);
      setLog(currentLog);
    }

    const anyChanged = updated.some((a, i) => a.active !== alerts[i]?.active);
    if (anyChanged) {
      setAlerts(updated);
      saveAlerts(updated);
    }
  }, [alerts, wazirxPrices, permGranted, formatPrice]);

  useEffect(() => {
    checkAlerts();
  }, [checkAlerts]);

  const symbols = Object.keys(wazirxPrices).sort();

  return (
    <div className="price-alerts">
      <div className="pa-header">
        <h3 className="pa-title">Price Alerts</h3>
        {!permGranted && (
          <button className="pa-perm-btn" onClick={requestPerm}>Enable Notifications</button>
        )}
      </div>

      {/* Add alert form */}
      <div className="pa-form">
        <select value={newSymbol} onChange={e => setNewSymbol(e.target.value)} className="pa-select">
          {symbols.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={newCondition} onChange={e => setNewCondition(e.target.value)} className="pa-select pa-select-sm">
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
        <input type="number" placeholder="Price (INR)" value={newPrice}
          onChange={e => setNewPrice(e.target.value)} className="pa-input" min="0" step="any" />
        <button className="pa-add-btn" onClick={addAlert}>Add Alert</button>
      </div>

      {/* Active alerts */}
      {alerts.length > 0 && (
        <div className="pa-list">
          {alerts.map(a => {
            const p = wazirxPrices[a.symbol];
            const current = p?.priceInr;
            return (
              <div key={a.id} className={`pa-alert-row ${!a.active ? "pa-alert-triggered" : ""}`}>
                <div className="pa-alert-info">
                  <strong>{a.symbol}</strong>
                  <span className="pa-alert-condition">
                    {a.condition === "above" ? "\u2191" : "\u2193"} {formatPrice(a.price)}
                  </span>
                  {current && <span className="pa-alert-current">Now: {formatPrice(current)}</span>}
                </div>
                <div className="pa-alert-actions">
                  {!a.active && <span className="pa-alert-badge">Triggered</span>}
                  <button className="pa-remove-btn" onClick={() => removeAlert(a.id)}>&times;</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {alerts.length === 0 && (
        <p className="pa-empty">No alerts set. Add one above to get notified when a token hits your target price.</p>
      )}

      {/* Alert log */}
      {log.length > 0 && (
        <div className="pa-log">
          <div className="pa-log-header">
            <span className="pa-log-title">Alert History</span>
            <button className="pa-clear-btn" onClick={clearLog}>Clear</button>
          </div>
          {log.slice(-10).reverse().map((l, i) => (
            <div key={i} className="pa-log-row">
              <strong>{l.symbol}</strong>
              <span>{l.condition === "above" ? "crossed above" : "dropped below"} {formatPrice(l.target)}</span>
              <span className="pa-log-time">{new Date(l.time).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
