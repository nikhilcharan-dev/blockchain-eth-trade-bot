"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import "./styles.css";

const INTERVALS = [
  { label: "1m", value: "1m", ms: 100 * 60 * 1000 },
  { label: "5m", value: "5m", ms: 500 * 60 * 1000 },
  { label: "15m", value: "15m", ms: 1500 * 60 * 1000 },
  { label: "1h", value: "1h", ms: 100 * 60 * 60 * 1000 },
  { label: "4h", value: "4h", ms: 400 * 60 * 60 * 1000 },
  { label: "1d", value: "1d", ms: 100 * 24 * 60 * 60 * 1000 },
];

const TOKENS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT",
  "AVAX", "TRX", "LINK", "MATIC", "SHIB", "LTC", "UNI",
];

/* ── Indicator math ── */
function calcSMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    let s = 0; for (let j = i - period + 1; j <= i; j++) s += data[j];
    return s / period;
  });
}

function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const r = [data[0]];
  for (let i = 1; i < data.length; i++) r.push(data[i] * k + r[i - 1] * (1 - k));
  return r;
}

function calcBollinger(closes, period = 20, mult = 2) {
  const sma = calcSMA(closes, period);
  return {
    sma,
    upper: closes.map((_, i) => {
      if (sma[i] === null) return null;
      const sl = closes.slice(i - period + 1, i + 1);
      const std = Math.sqrt(sl.reduce((s, v) => s + (v - sma[i]) ** 2, 0) / period);
      return sma[i] + mult * std;
    }),
    lower: closes.map((_, i) => {
      if (sma[i] === null) return null;
      const sl = closes.slice(i - period + 1, i + 1);
      const std = Math.sqrt(sl.reduce((s, v) => s + (v - sma[i]) ** 2, 0) / period);
      return sma[i] - mult * std;
    }),
  };
}

function calcRSI(closes, period = 14) {
  const r = [null];
  let ag = 0, al = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
    if (i <= period) {
      ag += g; al += l;
      if (i === period) { ag /= period; al /= period; r.push(100 - 100 / (1 + (al === 0 ? 100 : ag / al))); }
      else r.push(null);
    } else {
      ag = (ag * (period - 1) + g) / period;
      al = (al * (period - 1) + l) / period;
      r.push(100 - 100 / (1 + (al === 0 ? 100 : ag / al)));
    }
  }
  return r;
}

function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const ef = calcEMA(closes, fast), es = calcEMA(closes, slow);
  const ml = ef.map((v, i) => v - es[i]);
  const sl = calcEMA(ml, signal);
  return { macd: ml, signal: sl, hist: ml.map((v, i) => v - sl[i]) };
}

/* ── Indicators toggle ── */
const INDICATOR_LIST = [
  { id: "bb", label: "Bollinger Bands" },
  { id: "rsi", label: "RSI (14)" },
  { id: "macd", label: "MACD (12,26,9)" },
];

export default function CandlestickChart() {
  const { convert, currencySymbol } = useCurrency();
  const [token, setToken] = useState("ETH");
  const [intervalObj, setIntervalObj] = useState(INTERVALS[3]); // default 1h
  const interval = intervalObj.value;
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [indicators, setIndicators] = useState({ bb: true, rsi: false, macd: false });
  const canvasRef = useRef(null);

  const fetchCandles = useCallback(async () => {
    setLoading(true);
    try {
      const now = Date.now();
      const startTime = now - intervalObj.ms;
      const r = await fetch(
        `https://api.wazirx.com/sapi/v1/klines?symbol=${token.toLowerCase()}inr&interval=${interval}&startTime=${startTime}&endTime=${now}&limit=500`
      );
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) {
        setCandles(
          data
            .filter(k => k.length >= 6)
            .map(k => ({
              t: k[0], o: parseFloat(k[1]), h: parseFloat(k[2]),
              l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]),
            }))
            .filter(c => isFinite(c.c) && isFinite(c.o))
        );
      }
    } catch (err) {
      console.error("Candlestick fetch error:", err);
    } finally { setLoading(false); }
  }, [token, interval, intervalObj.ms]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = window.setInterval(fetchCandles, 30000);
    return () => window.clearInterval(iv);
  }, [fetchCandles]);

  const toggleIndicator = (id) => setIndicators(p => ({ ...p, [id]: !p[id] }));

  // ── Canvas render ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length < 2) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const closes = candles.map(c => c.c);
    const showRSI = indicators.rsi;
    const showMACD = indicators.macd;

    // Layout: main chart area, then optional RSI, then optional MACD
    const panels = 1 + (showRSI ? 1 : 0) + (showMACD ? 1 : 0);
    const mainH = H * (panels === 1 ? 1 : panels === 2 ? 0.7 : 0.55);
    const subH = panels === 1 ? 0 : panels === 2 ? H * 0.28 : H * 0.2;
    const gap = 6;
    const padRight = 60;
    const padLeft = 8;

    const n = candles.length;
    const cw = Math.max(2, (W - padRight - padLeft) / n * 0.7);
    const spacing = (W - padRight - padLeft) / n;

    // ── Main chart ──
    const allH = candles.map(c => c.h), allL = candles.map(c => c.l);
    let pMax = Math.max(...allH), pMin = Math.min(...allL);

    // Include Bollinger if enabled
    let bb = null;
    if (indicators.bb) {
      bb = calcBollinger(closes);
      bb.upper.forEach(v => { if (v !== null && v > pMax) pMax = v; });
      bb.lower.forEach(v => { if (v !== null && v < pMin) pMin = v; });
    }

    const pRange = pMax - pMin || 1;
    const yMain = (v) => 10 + (1 - (v - pMin) / pRange) * (mainH - 20);

    // Background
    ctx.fillStyle = "#0d0d14";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = 10 + (i / 4) * (mainH - 20);
      ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(W - padRight, y); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      const price = pMax - (i / 4) * pRange;
      ctx.fillText(currencySymbol + convert(price).toLocaleString(undefined, { maximumFractionDigits: 2 }), W - padRight + 4, y + 3);
    }

    // Bollinger Bands
    if (bb) {
      // Upper band
      ctx.beginPath();
      ctx.strokeStyle = "rgba(99,102,241,0.3)";
      ctx.lineWidth = 1;
      candles.forEach((_, i) => {
        if (bb.upper[i] === null) return;
        const x = padLeft + i * spacing + spacing / 2;
        i === 0 || bb.upper[i - 1] === null ? ctx.moveTo(x, yMain(bb.upper[i])) : ctx.lineTo(x, yMain(bb.upper[i]));
      });
      ctx.stroke();

      // Lower band
      ctx.beginPath();
      candles.forEach((_, i) => {
        if (bb.lower[i] === null) return;
        const x = padLeft + i * spacing + spacing / 2;
        i === 0 || bb.lower[i - 1] === null ? ctx.moveTo(x, yMain(bb.lower[i])) : ctx.lineTo(x, yMain(bb.lower[i]));
      });
      ctx.stroke();

      // SMA
      ctx.beginPath();
      ctx.strokeStyle = "rgba(99,102,241,0.6)";
      candles.forEach((_, i) => {
        if (bb.sma[i] === null) return;
        const x = padLeft + i * spacing + spacing / 2;
        i === 0 || bb.sma[i - 1] === null ? ctx.moveTo(x, yMain(bb.sma[i])) : ctx.lineTo(x, yMain(bb.sma[i]));
      });
      ctx.stroke();

      // Fill between bands
      ctx.fillStyle = "rgba(99,102,241,0.04)";
      ctx.beginPath();
      let started = false;
      candles.forEach((_, i) => {
        if (bb.upper[i] === null) return;
        const x = padLeft + i * spacing + spacing / 2;
        if (!started) { ctx.moveTo(x, yMain(bb.upper[i])); started = true; }
        else ctx.lineTo(x, yMain(bb.upper[i]));
      });
      for (let i = candles.length - 1; i >= 0; i--) {
        if (bb.lower[i] === null) continue;
        const x = padLeft + i * spacing + spacing / 2;
        ctx.lineTo(x, yMain(bb.lower[i]));
      }
      ctx.closePath(); ctx.fill();
    }

    // Candles
    candles.forEach((c, i) => {
      const x = padLeft + i * spacing + (spacing - cw) / 2;
      const green = c.c >= c.o;
      const color = green ? "#00e676" : "#ff5252";

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + cw / 2, yMain(c.h));
      ctx.lineTo(x + cw / 2, yMain(c.l));
      ctx.stroke();

      // Body
      const bTop = yMain(Math.max(c.o, c.c));
      const bBot = yMain(Math.min(c.o, c.c));
      const bH = Math.max(1, bBot - bTop);
      ctx.fillStyle = color;
      ctx.fillRect(x, bTop, cw, bH);
    });

    // ── RSI Panel ──
    let rsiTop = mainH + gap;
    if (showRSI) {
      const rsi = calcRSI(closes);
      const rsiH = subH;

      // Panel bg
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      ctx.fillRect(0, rsiTop, W, rsiH);

      // Overbought/oversold lines
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.setLineDash([4, 4]);
      [30, 70].forEach(level => {
        const y = rsiTop + 4 + (1 - level / 100) * (rsiH - 8);
        ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(W - padRight, y); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = "9px sans-serif";
        ctx.fillText(level.toString(), W - padRight + 4, y + 3);
      });
      ctx.setLineDash([]);

      // RSI line
      ctx.beginPath();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      rsi.forEach((v, i) => {
        if (v === null) return;
        const x = padLeft + i * spacing + spacing / 2;
        const y = rsiTop + 4 + (1 - v / 100) * (rsiH - 8);
        i === 0 || rsi[i - 1] === null ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Label
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "10px sans-serif";
      ctx.fillText("RSI", padLeft + 2, rsiTop + 12);

      rsiTop += rsiH + gap;
    }

    // ── MACD Panel ──
    if (showMACD) {
      const macd = calcMACD(closes);
      const macdH = subH;

      ctx.fillStyle = "rgba(255,255,255,0.02)";
      ctx.fillRect(0, rsiTop, W, macdH);

      const allVals = [...macd.macd, ...macd.signal, ...macd.hist].filter(v => v !== null && isFinite(v));
      if (allVals.length === 0) return;
      const mMax = Math.max(...allVals), mMin = Math.min(...allVals);
      const mRange = mMax - mMin || 1;
      const yM = (v) => rsiTop + 4 + (1 - (v - mMin) / mRange) * (macdH - 8);

      // Zero line
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padLeft, yM(0)); ctx.lineTo(W - padRight, yM(0)); ctx.stroke();
      ctx.setLineDash([]);

      // Histogram
      candles.forEach((_, i) => {
        const v = macd.hist[i];
        if (isNaN(v)) return;
        const x = padLeft + i * spacing + (spacing - cw) / 2;
        const y0 = yM(0), y1 = yM(v);
        ctx.fillStyle = v >= 0 ? "rgba(0,230,118,0.3)" : "rgba(255,82,82,0.3)";
        ctx.fillRect(x, Math.min(y0, y1), cw, Math.abs(y1 - y0) || 1);
      });

      // MACD line
      ctx.beginPath();
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 1.5;
      macd.macd.forEach((v, i) => {
        if (isNaN(v)) return;
        const x = padLeft + i * spacing + spacing / 2;
        i === 0 ? ctx.moveTo(x, yM(v)) : ctx.lineTo(x, yM(v));
      });
      ctx.stroke();

      // Signal line
      ctx.beginPath();
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 1;
      macd.signal.forEach((v, i) => {
        if (isNaN(v)) return;
        const x = padLeft + i * spacing + spacing / 2;
        i === 0 ? ctx.moveTo(x, yM(v)) : ctx.lineTo(x, yM(v));
      });
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "10px sans-serif";
      ctx.fillText("MACD", padLeft + 2, rsiTop + 12);
    }

    // Time labels — show dates for longer intervals, times for short
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(n / 7));
    for (let i = 0; i < n; i += step) {
      const x = padLeft + i * spacing + spacing / 2;
      const d = new Date(candles[i].t);
      let label;
      if (interval === "1d") {
        label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
      } else if (interval === "4h" || interval === "1h") {
        label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " +
          d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
      } else {
        label = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
      }
      ctx.fillText(label, x, mainH + (showRSI || showMACD ? -2 : 0) - 2);
    }

  }, [candles, indicators, convert, currencySymbol]);

  return (
    <div className="candlestick-wrapper">
      <div className="candlestick-header">
        <h2>Candlestick Chart</h2>
        <div className="candlestick-controls">
          <select value={token} onChange={e => setToken(e.target.value)} className="multi-chart-select">
            {TOKENS.map(t => <option key={t} value={t}>{t}/INR</option>)}
          </select>
          <div className="candlestick-intervals">
            {INTERVALS.map(i => (
              <button key={i.value}
                className={`candlestick-int-btn ${interval === i.value ? "candlestick-int-active" : ""}`}
                onClick={() => setIntervalObj(i)}>
                {i.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="candlestick-indicators">
        {INDICATOR_LIST.map(ind => (
          <label key={ind.id} className="candlestick-ind-toggle">
            <input type="checkbox" checked={indicators[ind.id]} onChange={() => toggleIndicator(ind.id)} />
            <span>{ind.label}</span>
          </label>
        ))}
      </div>

      <div className="candlestick-canvas-wrap">
        {loading && (
          <div className="chart-loader">
            <div className="candle-loader">
              <span /><span /><span /><span /><span /><span />
            </div>
            <div className="chart-loader-text">Loading candles...</div>
          </div>
        )}
        <canvas ref={canvasRef} className="candlestick-canvas" />
      </div>
    </div>
  );
}
