"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import "./PortfolioSummary.css";

const AVAILABLE_TOKENS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT",
  "AVAX", "TRX", "LINK", "MATIC", "SHIB", "LTC", "UNI",
];
const STORAGE_KEY = "portfolio_holdings";
const PL_HISTORY_KEY = "portfolio_pl_history";
const DONUT_COLORS = [
  "#00e5ff", "#ff6d00", "#76ff03", "#d500f9", "#ffea00",
  "#ff1744", "#00e676", "#2979ff", "#ff9100", "#f50057",
];

function loadHoldings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function saveHoldings(h) { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); }
function loadPlHistory() {
  try { return JSON.parse(localStorage.getItem(PL_HISTORY_KEY)) || []; } catch { return []; }
}
function savePlHistory(h) { localStorage.setItem(PL_HISTORY_KEY, JSON.stringify(h.slice(-720))); }

/* ── Canvas: Donut Chart ── */
function DonutChart({ segments, size = 140 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !segments.length) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2, r = size / 2 - 6, inner = r * 0.62;
    const total = segments.reduce((s, v) => s + v.value, 0);
    if (total <= 0) return;
    let a = -Math.PI / 2;
    segments.forEach((seg, i) => {
      const sl = (seg.value / total) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, a, a + sl); ctx.arc(cx, cy, inner, a + sl, a, true);
      ctx.closePath(); ctx.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length]; ctx.fill();
      a += sl;
    });
    ctx.beginPath(); ctx.arc(cx, cy, inner - 1, 0, Math.PI * 2);
    ctx.fillStyle = "#111118"; ctx.fill();
  }, [segments, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}

/* ── Canvas: Sparkline ── */
function Sparkline({ data, width = 80, height = 28 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data?.length || data.length < 2) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr; c.height = height * dpr;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, width, height);
    const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
    const step = width / (data.length - 1);
    const clr = data[data.length - 1] >= data[0] ? "#00e676" : "#ff5252";
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step, y = height - ((v - mn) / rng) * (height - 4) - 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = clr; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.lineTo((data.length - 1) * step, height); ctx.lineTo(0, height); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, clr + "30"); g.addColorStop(1, clr + "00");
    ctx.fillStyle = g; ctx.fill();
  }, [data, width, height]);
  if (!data || data.length < 2) return <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>---</span>;
  return <canvas ref={ref} style={{ width, height, display: "block" }} />;
}

/* ── CSV export ── */
function downloadCsv(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── Token Detail Drawer ── */
function TokenDrawer({ token, priceData, sparkData, formatPrice, formatValue, onClose }) {
  if (!token) return null;
  const p = priceData;
  const cp = p?.priceInr || null;
  const val = cp ? token.amount * cp : null;
  const abp = token.avgBuyPrice || null;
  const pl = abp && cp ? ((cp - abp) / abp) * 100 : null;

  const Stat = ({ label, value, cls }) => (
    <div className="drawer-stat">
      <span className="drawer-stat-label">{label}</span>
      <span className={`drawer-stat-value ${cls || ""}`}>{value}</span>
    </div>
  );

  return (
    <div className="token-drawer-overlay" onClick={onClose}>
      <div className="token-drawer" onClick={e => e.stopPropagation()}>
        <div className="token-drawer-header">
          <h3>{token.symbol}</h3>
          <button className="token-drawer-close" onClick={onClose}>&times;</button>
        </div>
        <div className="token-drawer-body">
          {sparkData?.length > 1 && (
            <div className="drawer-spark-wrap">
              <Sparkline data={sparkData} width={280} height={60} />
              <span className="drawer-spark-label">24h Price Movement</span>
            </div>
          )}
          <div className="drawer-stats">
            <Stat label="Current Price" value={cp ? formatPrice(cp) : "---"} />
            <Stat label="Avg Buy Price" value={abp ? formatPrice(abp) : "---"} />
            <Stat label="Holdings" value={`${token.amount} ${token.symbol}`} />
            <Stat label="Value" value={val ? formatValue(val) : "---"} />
            {pl !== null && <Stat label="P/L" value={`${pl >= 0 ? "+" : ""}${pl.toFixed(2)}%`} cls={pl >= 0 ? "portfolio-up" : "portfolio-down"} />}
            {p && (
              <>
                <Stat label="24h Change" value={`${p.change >= 0 ? "+" : ""}${p.change.toFixed(2)}%`} cls={p.change >= 0 ? "portfolio-up" : "portfolio-down"} />
                <Stat label="24h High" value={formatPrice(p.highInr)} />
                <Stat label="24h Low" value={formatPrice(p.lowInr)} />
                <Stat label="Volume" value={p.volume?.toLocaleString() || "---"} />
                <Stat label="Bid / Ask" value={`${formatPrice(p.bidPriceInr)} / ${formatPrice(p.askPriceInr)}`} />
              </>
            )}
            {token.free !== undefined && <Stat label="Free / Locked" value={`${token.free} / ${token.locked || 0}`} />}
            {token.totalInvested > 0 && <Stat label="Total Invested" value={formatValue(token.totalInvested)} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */
export default function PortfolioSummary() {
  const [holdings, setHoldings] = useState([]);
  const [totalValue, setTotalValue] = useState(0);
  const [change24h, setChange24h] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const [wazirxConnected, setWazirxConnected] = useState(false);
  const [walletHoldings, setWalletHoldings] = useState([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState(null);
  const [walletTotalValue, setWalletTotalValue] = useState(0);
  const [walletTotalInvested, setWalletTotalInvested] = useState(0);
  const [walletChange24h, setWalletChange24h] = useState(0);

  // NEW state
  const [sortBy, setSortBy] = useState("value");
  const [sortDir, setSortDir] = useState("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedToken, setSelectedToken] = useState(null);
  const [sparklines, setSparklines] = useState({});
  const [plHistory, setPlHistory] = useState([]);

  const { wazirxPrices, formatValue, formatPrice } = useCurrency();

  // ── Data fetching (unchanged logic) ──
  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.settings?.hasWazirxCredentials) setWazirxConnected(true); })
      .catch(() => {});
  }, []);

  const fetchWalletPortfolio = useCallback(async () => {
    setWalletLoading(true); setWalletError(null);
    try {
      const resp = await fetch("/api/wazirx/portfolio", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to fetch portfolio");
      setWalletHoldings((Array.isArray(data) ? data : []).filter(t => t.amount > 0));
    } catch (err) { setWalletError(err.message); }
    finally { setWalletLoading(false); }
  }, []);

  useEffect(() => { if (wazirxConnected) fetchWalletPortfolio(); }, [wazirxConnected, fetchWalletPortfolio]);
  useEffect(() => { setHoldings(loadHoldings()); }, []);

  // Calculate manual totals
  useEffect(() => {
    let tot = 0, wc = 0;
    for (const h of holdings) {
      const p = wazirxPrices[h.symbol];
      if (p) { const v = h.amount * p.priceInr; tot += v; wc += v * (p.change / 100); }
    }
    setTotalValue(tot);
    setChange24h(tot > 0 ? (wc / tot) * 100 : 0);
  }, [wazirxPrices, holdings]);

  // Calculate wallet totals
  useEffect(() => {
    if (!wazirxConnected || !walletHoldings.length) {
      setWalletTotalValue(0); setWalletTotalInvested(0); setWalletChange24h(0); return;
    }
    let tot = 0, inv = 0, wc = 0;
    for (const h of walletHoldings) {
      const p = wazirxPrices[h.symbol];
      if (p) { const v = h.amount * p.priceInr; tot += v; wc += v * (p.change / 100); }
      if (h.totalInvested) inv += h.totalInvested;
    }
    setWalletTotalValue(tot); setWalletTotalInvested(inv);
    setWalletChange24h(tot > 0 ? (wc / tot) * 100 : 0);
  }, [wazirxPrices, walletHoldings, wazirxConnected]);

  // ── Sparkline data ──
  const fetchedSparkRef = useRef(new Set());
  useEffect(() => {
    let cancelled = false;
    const syms = [...new Set([
      ...walletHoldings.filter(h => h.symbol !== "INR").map(h => h.symbol),
      ...holdings.map(h => h.symbol),
    ])].filter(sym => !fetchedSparkRef.current.has(sym));

    if (syms.length === 0) return;
    syms.forEach(sym => fetchedSparkRef.current.add(sym));

    Promise.allSettled(
      syms.map(async sym => {
        const r = await fetch(
          `https://api.wazirx.com/sapi/v1/klines?symbol=${sym.toLowerCase()}inr&limit=24&interval=1h`
        );
        if (!r.ok) return;
        const d = await r.json();
        if (Array.isArray(d) && !cancelled) {
          setSparklines(prev => ({ ...prev, [sym]: d.map(k => parseFloat(k[4])) }));
        }
      })
    );

    return () => { cancelled = true; };
  }, [walletHoldings, holdings]);

  // ── P/L history snapshots ──
  useEffect(() => { setPlHistory(loadPlHistory()); }, []);
  const plRef = useRef(null);
  useEffect(() => {
    const combined = walletTotalValue + totalValue;
    if (combined <= 0) return;
    if (plRef.current) clearTimeout(plRef.current);
    plRef.current = setTimeout(() => {
      const hist = loadPlHistory();
      const last = hist[hist.length - 1];
      if (!last || Date.now() - last.t > 3600000) {
        const updated = [...hist, { t: Date.now(), v: combined, i: walletTotalInvested }];
        savePlHistory(updated); setPlHistory(updated);
      }
    }, 5000);
    return () => clearTimeout(plRef.current);
  }, [walletTotalValue, totalValue, walletTotalInvested]);

  // ── Manual holding actions ──
  const addHolding = () => {
    const sym = newSymbol.toUpperCase().trim();
    const amt = parseFloat(newAmount);
    if (!sym || isNaN(amt) || amt <= 0) return;
    const existing = holdings.find(h => h.symbol === sym);
    const updated = existing
      ? holdings.map(h => h.symbol === sym ? { ...h, amount: h.amount + amt } : h)
      : [...holdings, { symbol: sym, amount: amt }];
    setHoldings(updated); saveHoldings(updated);
    setNewSymbol(""); setNewAmount(""); setShowAdd(false);
  };
  const removeHolding = (sym) => {
    const updated = holdings.filter(h => h.symbol !== sym);
    setHoldings(updated); saveHoldings(updated);
  };
  const available = AVAILABLE_TOKENS.filter(t => !holdings.find(h => h.symbol === t));

  // ── Enriched + sorted combined holdings ──
  const enriched = useMemo(() => {
    const map = {};
    for (const h of walletHoldings) {
      if (h.symbol === "INR") continue;
      const p = wazirxPrices[h.symbol];
      const cp = p?.priceInr || null;
      const val = cp ? h.amount * cp : 0;
      const abp = h.avgBuyPrice || null;
      const pl = abp && abp > 0 && cp ? ((cp - abp) / abp) * 100 : null;
      map[h.symbol] = { ...h, source: "wazirx", currentPrice: cp, valInr: val, avgBuyPrice: abp, tokenPL: pl, change24h: p?.change || 0 };
    }
    for (const h of holdings) {
      if (map[h.symbol]) continue;
      const p = wazirxPrices[h.symbol];
      const cp = p?.priceInr || null;
      const val = cp ? h.amount * cp : 0;
      map[h.symbol] = { ...h, source: "manual", currentPrice: cp, valInr: val, avgBuyPrice: null, tokenPL: null, change24h: p?.change || 0 };
    }
    let list = Object.values(map);
    if (searchQuery) list = list.filter(h => h.symbol.toLowerCase().includes(searchQuery.toLowerCase()));
    list.sort((a, b) => {
      let av, bv;
      switch (sortBy) {
        case "token": av = a.symbol; bv = b.symbol; break;
        case "holdings": av = a.amount; bv = b.amount; break;
        case "bought": av = a.avgBuyPrice || 0; bv = b.avgBuyPrice || 0; break;
        case "price": av = a.currentPrice || 0; bv = b.currentPrice || 0; break;
        case "pl": av = a.tokenPL ?? -1e9; bv = b.tokenPL ?? -1e9; break;
        default: av = a.valInr || 0; bv = b.valInr || 0;
      }
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [walletHoldings, holdings, wazirxPrices, searchQuery, sortBy, sortDir]);

  const donutSegments = useMemo(() =>
    enriched.filter(h => h.valInr > 0).sort((a, b) => b.valInr - a.valInr).slice(0, 10).map(h => ({ label: h.symbol, value: h.valInr })),
    [enriched]
  );

  const fiatWallet = walletHoldings.filter(h => h.symbol === "INR");
  const combinedTotal = walletTotalValue + totalValue;
  const combinedInvested = walletTotalInvested;
  const overallPL = combinedInvested > 0 ? ((combinedTotal - combinedInvested) / combinedInvested) * 100 : null;

  const combined24hChange = useMemo(() => {
    const ct = walletTotalValue + totalValue;
    if (ct <= 0) return 0;
    return (walletTotalValue > 0 ? walletChange24h * (walletTotalValue / ct) : 0) +
           (totalValue > 0 ? change24h * (totalValue / ct) : 0);
  }, [walletTotalValue, totalValue, walletChange24h, change24h]);

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };
  const arrow = (col) => sortBy !== col ? "" : sortDir === "asc" ? " \u2191" : " \u2193";

  const handleExport = () => {
    const hdr = ["Token", "Holdings", "Bought At (INR)", "Current Price (INR)", "Value (INR)", "P/L %", "Source"];
    const rows = enriched.map(h => [
      h.symbol, h.amount, h.avgBuyPrice || "N/A", h.currentPrice || "N/A",
      (h.valInr || 0).toFixed(2), h.tokenPL !== null ? h.tokenPL.toFixed(2) + "%" : "N/A", h.source
    ]);
    downloadCsv([hdr, ...rows], `portfolio_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // ════════════════ RENDER ════════════════
  return (
    <div className="portfolio-summary-wrapper">
      <div className="portfolio-section">
        {/* Header row */}
        <div className="portfolio-section-header">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {wazirxConnected && (
              <div className="portfolio-section-badge portfolio-badge-wazirx">
                <span className="portfolio-badge-dot"></span> WazirX Wallet
              </div>
            )}
            {holdings.length > 0 && (
              <div className="portfolio-section-badge portfolio-badge-manual">Manual</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {enriched.length > 0 && (
              <button className="portfolio-action-btn" onClick={handleExport}>Export CSV</button>
            )}
            <button className="portfolio-add-btn" onClick={() => setShowAdd(!showAdd)}>
              {showAdd ? "Cancel" : "+ Add"}
            </button>
            {wazirxConnected && (
              <button className="portfolio-refresh-btn" onClick={fetchWalletPortfolio} disabled={walletLoading}>
                {walletLoading ? "Loading..." : "Refresh"}
              </button>
            )}
          </div>
        </div>

        {/* Add holding form */}
        {showAdd && (
          <div className="portfolio-add-form">
            <select value={newSymbol} onChange={e => setNewSymbol(e.target.value)} className="portfolio-select">
              <option value="">Select token</option>
              {available.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="number" placeholder="Amount" value={newAmount}
              onChange={e => setNewAmount(e.target.value)} className="portfolio-input" min="0" step="any" />
            <button className="portfolio-confirm-btn" onClick={addHolding}>Add</button>
          </div>
        )}

        {walletError && <div className="portfolio-error">{walletError}</div>}

        {/* Summary + Donut */}
        <div className="portfolio-summary">
          <div className="portfolio-card portfolio-total">
            <span className="portfolio-label">Portfolio Value</span>
            <span className="portfolio-value">{formatValue(combinedTotal)}</span>
            {combinedTotal > 0 && (
              <span className={`portfolio-change ${combined24hChange >= 0 ? "portfolio-up" : "portfolio-down"}`}>
                {combined24hChange >= 0 ? "+" : ""}{combined24hChange.toFixed(2)}% (24h)
              </span>
            )}
            {combinedInvested > 0 && overallPL !== null && (
              <div className="portfolio-pl-summary">
                <span className="portfolio-label-sm">Invested: {formatValue(combinedInvested)}</span>
                <span className={`portfolio-change ${overallPL >= 0 ? "portfolio-up" : "portfolio-down"}`}>
                  P/L: {overallPL >= 0 ? "+" : ""}{overallPL.toFixed(2)}%
                  {" "}({formatValue(combinedTotal - combinedInvested)})
                </span>
              </div>
            )}
            {plHistory.length > 1 && (
              <div className="portfolio-pl-chart">
                <Sparkline data={plHistory.map(h => h.v)} width={200} height={36} />
                <span className="portfolio-label-sm">Portfolio trend</span>
              </div>
            )}
            {walletLoading && <span className="portfolio-loading">Fetching portfolio...</span>}
            {!walletLoading && enriched.length === 0 && holdings.length === 0 && (
              <span className="portfolio-empty">No holdings yet. Add tokens or connect WazirX.</span>
            )}
          </div>

          {donutSegments.length > 0 && (
            <div className="portfolio-card portfolio-donut-card">
              <span className="portfolio-label">Allocation</span>
              <div className="portfolio-donut-wrap">
                <DonutChart segments={donutSegments} size={140} />
                <div className="donut-legend">
                  {donutSegments.slice(0, 8).map((s, i) => (
                    <div key={s.label} className="donut-legend-item">
                      <span className="donut-legend-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="donut-legend-label">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Search + Table */}
        {(enriched.length > 0 || fiatWallet.length > 0) && (
          <div className="portfolio-table-wrap">
            <input type="text" placeholder="Search tokens..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} className="portfolio-search" />

            <div className="portfolio-table">
              <div className="portfolio-table-header">
                <span className="pt-col pt-col-token pt-sortable" onClick={() => handleSort("token")}>Token{arrow("token")}</span>
                <span className="pt-col pt-col-amount pt-sortable" onClick={() => handleSort("holdings")}>Holdings{arrow("holdings")}</span>
                <span className="pt-col pt-col-spark">24h</span>
                <span className="pt-col pt-col-bought pt-sortable" onClick={() => handleSort("bought")}>Bought At{arrow("bought")}</span>
                <span className="pt-col pt-col-current pt-sortable" onClick={() => handleSort("price")}>Price{arrow("price")}</span>
                <span className="pt-col pt-col-value pt-sortable" onClick={() => handleSort("value")}>Value{arrow("value")}</span>
                <span className="pt-col pt-col-pl pt-sortable" onClick={() => handleSort("pl")}>P/L %{arrow("pl")}</span>
              </div>

              {fiatWallet.map(h => (
                <div key={h.symbol} className="portfolio-table-row portfolio-row-fiat">
                  <span className="pt-col pt-col-token"><strong>INR</strong></span>
                  <span className="pt-col pt-col-amount">{h.free != null ? h.free.toFixed(2) : h.amount?.toFixed(2) ?? "---"}</span>
                  <span className="pt-col pt-col-spark">---</span>
                  <span className="pt-col pt-col-bought">---</span>
                  <span className="pt-col pt-col-current">---</span>
                  <span className="pt-col pt-col-value">{`\u20B9${h.amount?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}</span>
                  <span className="pt-col pt-col-pl">---</span>
                </div>
              ))}

              {enriched.map(h => {
                const plClass = h.tokenPL !== null ? (h.tokenPL >= 0 ? "portfolio-up" : "portfolio-down") : "";
                return (
                  <div key={h.symbol} className="portfolio-table-row portfolio-row-clickable"
                    onClick={() => setSelectedToken(h)}>
                    <span className="pt-col pt-col-token">
                      <strong>{h.symbol}</strong>
                      {h.source === "manual" && <span className="pt-source-badge">M</span>}
                      {h.locked > 0 && <span className="holding-locked-badge-sm">L:{h.locked}</span>}
                    </span>
                    <span className="pt-col pt-col-amount">{h.amount} {h.symbol}</span>
                    <span className="pt-col pt-col-spark">
                      <Sparkline data={sparklines[h.symbol]} width={64} height={24} />
                    </span>
                    <span className="pt-col pt-col-bought">{h.avgBuyPrice ? formatPrice(h.avgBuyPrice) : "---"}</span>
                    <span className="pt-col pt-col-current">{h.currentPrice ? formatPrice(h.currentPrice) : "---"}</span>
                    <span className="pt-col pt-col-value">{h.valInr ? formatValue(h.valInr) : "---"}</span>
                    <span className={`pt-col pt-col-pl ${plClass}`}>
                      {h.tokenPL !== null ? `${h.tokenPL >= 0 ? "+" : ""}${h.tokenPL.toFixed(2)}%` : "---"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual holdings removal tags */}
        {holdings.length > 0 && (
          <div className="portfolio-manual-tags">
            <span className="portfolio-label-sm">Manual holdings:</span>
            {holdings.map(h => (
              <span key={h.symbol} className="portfolio-manual-tag">
                {h.symbol} ({h.amount})
                <button onClick={() => removeHolding(h.symbol)} className="portfolio-manual-tag-x">&times;</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Token Detail Drawer */}
      {selectedToken && (
        <TokenDrawer
          token={selectedToken}
          priceData={wazirxPrices[selectedToken.symbol]}
          sparkData={sparklines[selectedToken.symbol]}
          formatPrice={formatPrice}
          formatValue={formatValue}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  );
}
