"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const CurrencyContext = createContext(null);

const WAZIRX_TICKERS_URL = "https://api.wazirx.com/sapi/v1/tickers/24hr";
const FX_RATE_URL = "https://open.er-api.com/v6/latest/USD";

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

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState("INR");
  const [usdToInr, setUsdToInr] = useState(83.5);
  const [wazirxPrices, setWazirxPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Load saved preference
  useEffect(() => {
    const saved = localStorage.getItem("currency_preference");
    if (saved === "USD" || saved === "INR") setCurrency(saved);
  }, []);

  // Fetch USD to INR exchange rate
  useEffect(() => {
    async function fetchRate() {
      try {
        const resp = await fetch(FX_RATE_URL);
        const data = await resp.json();
        if (data?.rates?.INR) setUsdToInr(data.rates.INR);
      } catch (err) {
        console.error("FX rate fetch error:", err);
      }
    }
    fetchRate();
    const interval = setInterval(fetchRate, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch WazirX prices (all INR pairs)
  const fetchPrices = useCallback(async () => {
    try {
      const resp = await fetch(WAZIRX_TICKERS_URL);
      if (!resp.ok) return;

      const data = await resp.json();
      const pairMap = {};
      for (const ticker of data) {
        pairMap[ticker.symbol] = ticker;
      }

      const prices = {};
      for (const { symbol, pair } of SUPPORTED_PAIRS) {
        const ticker = pairMap[pair];
        if (ticker) {
          const lastPrice = parseFloat(ticker.lastPrice);
          const openPrice = parseFloat(ticker.openPrice);
          const vol = parseFloat(ticker.volume);
          const change = openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0;

          prices[symbol] = {
            priceInr: lastPrice,
            highInr: parseFloat(ticker.highPrice),
            lowInr: parseFloat(ticker.lowPrice),
            volume: vol,
            quoteVolumeInr: vol * lastPrice,
            change,
            bidPriceInr: parseFloat(ticker.bidPrice),
            askPriceInr: parseFloat(ticker.askPrice),
          };
        }
      }

      setWazirxPrices(prices);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (err) {
      console.error("WazirX prices fetch error:", err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 10000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const toggleCurrency = () => {
    setCurrency((prev) => {
      const next = prev === "INR" ? "USD" : "INR";
      localStorage.setItem("currency_preference", next);
      return next;
    });
  };

  // Convert INR price to the active currency
  const convert = (inrPrice) => {
    if (!inrPrice) return 0;
    return currency === "INR" ? inrPrice : inrPrice / usdToInr;
  };

  const currencySymbol = currency === "INR" ? "₹" : "$";
  const locale = currency === "INR" ? "en-IN" : "en-US";

  const formatPrice = (inrPrice) => {
    if (!inrPrice) return "---";
    const val = convert(inrPrice);
    if (val >= 1000) {
      return currencySymbol + val.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (val >= 1) {
      return currencySymbol + val.toFixed(4);
    }
    return currencySymbol + val.toFixed(6);
  };

  const formatVolume = (inrVol) => {
    if (!inrVol) return "---";
    const vol = convert(inrVol);
    if (currency === "INR") {
      if (vol >= 1e7) return `₹${(vol / 1e7).toFixed(2)}Cr`;
      if (vol >= 1e5) return `₹${(vol / 1e5).toFixed(2)}L`;
      if (vol >= 1e3) return `₹${(vol / 1e3).toFixed(1)}K`;
      return `₹${vol.toFixed(0)}`;
    }
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`;
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(1)}K`;
    return `$${vol.toFixed(0)}`;
  };

  const formatValue = (inrVal) => {
    if (!inrVal && inrVal !== 0) return "---";
    const val = convert(inrVal);
    return currencySymbol + val.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        toggleCurrency,
        usdToInr,
        wazirxPrices,
        loading,
        lastUpdated,
        convert,
        formatPrice,
        formatVolume,
        formatValue,
        currencySymbol,
        pairLabel: currency === "INR" ? "/INR" : "/USD",
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
