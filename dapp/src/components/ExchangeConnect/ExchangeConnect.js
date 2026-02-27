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
  const [wazirxData, setWazirxData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiConnected, setApiConnected] = useState(false);

  // Check if API key was previously saved
  useEffect(() => {
    const savedKey = localStorage.getItem("wazirx_api_key");
    if (savedKey) {
      setApiConnected(true);
      setApiKeyInput(savedKey);
    }
  }, []);

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
    const interval = setInterval(fetchWazirxPrices, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [fetchWazirxPrices]);

  const connectApiKey = () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    localStorage.setItem("wazirx_api_key", key);
    setApiConnected(true);
  };

  const disconnectApi = () => {
    localStorage.removeItem("wazirx_api_key");
    localStorage.removeItem("wazirx_api_secret");
    setApiConnected(false);
    setApiKeyInput("");
  };

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

  return (
    <div className="exchange-connect">
      {/* WazirX Connection Card */}
      <div className="exchange-card">
        <div className="exchange-header">
          <div className="exchange-title-row">
            <h2 className="exchange-title">WazirX</h2>
            <span className={`exchange-status ${apiConnected ? "status-connected" : "status-disconnected"}`}>
              {apiConnected ? "Connected" : "Not Connected"}
            </span>
          </div>
          <p className="exchange-subtitle">Indian crypto exchange — INR prices</p>
        </div>

        {!apiConnected ? (
          <div className="exchange-connect-form">
            <p className="exchange-info">
              Connect your WazirX account using your API key to access personalized data.
              You can generate API keys from your WazirX account settings.
            </p>
            <div className="exchange-input-row">
              <input
                type="password"
                placeholder="Enter WazirX API Key"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="exchange-input"
              />
              <button className="exchange-connect-btn" onClick={connectApiKey}>
                Connect
              </button>
            </div>
            <p className="exchange-note">
              Your API key is stored locally in your browser only.
            </p>
          </div>
        ) : (
          <div className="exchange-connected-info">
            <p className="exchange-connected-text">
              API key saved locally. Market data is fetched from WazirX public API.
            </p>
            <button className="exchange-disconnect-btn" onClick={disconnectApi}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* WazirX Live Prices */}
      <div className="exchange-prices-card">
        <div className="exchange-prices-header">
          <h3>WazirX Live Prices (INR)</h3>
          {lastUpdated && (
            <span className="exchange-last-updated">
              Updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        {error && <div className="exchange-error">{error}</div>}

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
    </div>
  );
}
