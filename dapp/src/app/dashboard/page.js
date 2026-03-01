'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { CurrencyProvider, useCurrency } from "@/context/CurrencyContext"
import PriceTicker from "@/components/PriceTicker/PriceTicker"
import PortfolioSummary from "@/components/PortfolioSummary/PortfolioSummary"
import PriceAlerts from "@/components/PriceAlerts/PriceAlerts"
import MainChart from "@/components/CryptoGraphs/MainChart"
import MultiChart from "@/components/CryptoGraphs/MultiChart"
import CandlestickChart from "@/components/CryptoGraphs/CandlestickChart"
import Watchlist from "@/components/Watchlist/Watchlist"
import MarketStats from "@/components/MarketStats/MarketStats"
import ExchangeConnect from "@/components/ExchangeConnect/ExchangeConnect"
import AiChat from "@/components/AiChat/AiChat"
import AiChatWidget from "@/components/AiChat/AiChatWidget"
import AutoTradeRange from "@/components/AutoTradeRange/AutoTradeRange"
import './styles.css'

export default function DashboardPage() {
  return (
    <CurrencyProvider>
      <DashboardContent />
    </CurrencyProvider>
  )
}

function DashboardContent() {
  const [activeTab, setActiveTab] = useState('overview')
  const [username, setUsername] = useState('Guest')
  const router = useRouter()
  const contentRef = useRef(null)

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("id"))
      if (stored?.username) {
        setUsername(stored.username)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (contentRef.current) {
      gsap.from(contentRef.current, {
        opacity: 0,
        y: 20,
        duration: 0.5,
        ease: "power2.out",
      })
    }
  }, [activeTab])

  const handleLogout = () => {
    localStorage.removeItem("id")
    fetch("/api/auth/login", { method: "DELETE" })
      .catch(() => {})
      .finally(() => router.push("/"))
  }

  const isGuest = username === 'Guest'

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'trade', label: 'Trade' },
    { id: 'watchlist', label: 'Watchlist' },
    { id: 'markets', label: 'Markets' },
    { id: 'exchange', label: 'WazirX' },
    ...(!isGuest ? [{ id: 'autoTrade', label: 'Auto Trade' }] : []),
    { id: 'ai', label: 'Trade Bot' },
    ...(!isGuest ? [{ id: 'account', label: 'Account' }] : []),
  ]

  return (
    <section className='dashboard'>
      <PriceTicker />
      <NavigationBar
        username={username}
        activeTab={activeTab}
        tabs={tabs}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
      />

      <div ref={contentRef} className="dashboard-content">
        {activeTab === 'overview' && (
          <>
            <PortfolioSummary />
            <PriceAlerts />
            <MarketStats />
            <Watchlist />
          </>
        )}

        {activeTab === 'trade' && (
          <>
            <CandlestickChart />
            <MainChart />
            <MultiChart />
          </>
        )}

        {activeTab === 'watchlist' && (
          <Watchlist />
        )}

        {activeTab === 'markets' && (
          <>
            <MarketStats />
            <MultiChart />
          </>
        )}

        {activeTab === 'exchange' && (
          <ExchangeConnect />
        )}

        {activeTab === 'autoTrade' && !isGuest && (
          <AutoTradeRange />
        )}

        {activeTab === 'ai' && (
          <AiChat />
        )}

        {activeTab === 'account' && !isGuest && (
          <AccountPanel username={username} />
        )}
      </div>

      {activeTab !== 'ai' && <AiChatWidget />}
      <Footer />
    </section>
  )
}

const NavigationBar = ({ username, activeTab, tabs, onTabChange, onLogout }) => {
  const { currency, toggleCurrency } = useCurrency()

  return (
    <nav className="dashboard-nav">
      <div className="nav-left">
        <h1 className="nav-logo">CryptoDash</h1>
        <div className="nav-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'nav-tab-active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="nav-right">
        <button className="currency-toggle" onClick={toggleCurrency}>
          <span className={`currency-option ${currency === "INR" ? "currency-active" : ""}`}>
            INR
          </span>
          <span className={`currency-option ${currency === "USD" ? "currency-active" : ""}`}>
            USD
          </span>
        </button>
        <div className="nav-user">
          <div className="nav-avatar">
            {username.charAt(0).toUpperCase()}
          </div>
          <span className="nav-username">{username}</span>
        </div>
        <button className="nav-logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </nav>
  )
}

function AccountPanel({ username }) {
  const [logins, setLogins] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLogins = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch("/api/auth/sessions")
      if (resp.ok) {
        const data = await resp.json()
        setLogins(data.logins || [])
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchLogins() }, [fetchLogins])

  function parseBrowser(ua) {
    if (!ua || ua === "Unknown") return "Unknown"
    if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome"
    if (ua.includes("Edg")) return "Edge"
    if (ua.includes("Firefox")) return "Firefox"
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari"
    if (ua.includes("Opera") || ua.includes("OPR")) return "Opera"
    return ua.slice(0, 40)
  }

  function parseDevice(ua) {
    if (!ua || ua === "Unknown") return ""
    if (ua.includes("Mobile") || ua.includes("Android")) return "Mobile"
    if (ua.includes("iPad") || ua.includes("Tablet")) return "Tablet"
    if (ua.includes("Windows")) return "Windows"
    if (ua.includes("Mac")) return "Mac"
    if (ua.includes("Linux")) return "Linux"
    return ""
  }

  return (
    <div className="account-panel">
      <div className="account-header">
        <div className="account-avatar">
          {username.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="account-username">{username}</h2>
          <span className="account-role">Registered User</span>
        </div>
      </div>

      <div className="account-section">
        <div className="account-section-header">
          <h3>Login History</h3>
          <button className="account-refresh-btn" onClick={fetchLogins} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {!loading && logins.length === 0 && (
          <p className="account-empty">No login history yet. History will appear after your next login.</p>
        )}

        {logins.length > 0 && (
          <div className="account-logins-list">
            {logins.map((l, i) => (
              <div key={i} className={`account-login-row ${i === 0 ? "account-login-current" : ""}`}>
                <div className="account-login-info">
                  <span className="account-login-browser">
                    {parseBrowser(l.userAgent)}
                  </span>
                  {parseDevice(l.userAgent) && (
                    <span className="account-login-device">{parseDevice(l.userAgent)}</span>
                  )}
                  {i === 0 && <span className="account-login-badge">Current</span>}
                </div>
                <div className="account-login-details">
                  <span className="account-login-ip">{l.ip}</span>
                  <span className="account-login-time">
                    {new Date(l.at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const Footer = () => {
  return (
    <footer className="dashboard-footer">
      <div className="footer-content">
        <span className="footer-brand">CryptoDash</span>
        <span className="footer-divider">|</span>
        <span className="footer-text">Real-time data from WazirX &amp; Binance</span>
        <span className="footer-divider">|</span>
        <span className="footer-text">Nikhil Charan &copy; 2025</span>
      </div>
    </footer>
  )
}
