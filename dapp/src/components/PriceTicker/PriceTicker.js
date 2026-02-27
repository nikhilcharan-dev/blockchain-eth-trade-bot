"use client";

import { useCurrency } from "@/context/CurrencyContext";
import "./PriceTicker.css";

const TOKENS = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "AVAX"];

export default function PriceTicker() {
  const { wazirxPrices, formatPrice, pairLabel } = useCurrency();

  return (
    <div className="ticker-wrapper">
      <div className="ticker-track">
        {[...TOKENS, ...TOKENS].map((symbol, i) => {
          const data = wazirxPrices[symbol];
          const changeClass = data?.change >= 0 ? "ticker-up" : "ticker-down";

          return (
            <div key={`${symbol}-${i}`} className="ticker-item">
              <span className="ticker-symbol">{symbol}</span>
              <span className="ticker-price">
                {data ? formatPrice(data.priceInr) : "---"}
              </span>
              {data && (
                <span className={`ticker-change ${changeClass}`}>
                  {data.change >= 0 ? "+" : ""}
                  {data.change?.toFixed(2)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
