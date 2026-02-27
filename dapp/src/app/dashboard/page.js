'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { CurrencyProvider, useCurrency } from "@/context/CurrencyContext"
import PriceTicker from "@/components/PriceTicker/PriceTicker"
import PortfolioSummary from "@/components/PortfolioSummary/PortfolioSummary"
import MainChart from "@/components/CryptoGraphs/MainChart"
import MultiChart from "@/components/CryptoGraphs/MultiChart"
import Watchlist from "@/components/Watchlist/Watchlist"
import MarketStats from "@/components/MarketStats/MarketStats"
import ExchangeConnect from "@/components/ExchangeConnect/ExchangeConnect"
import AiChat from "@/components/AiChat/AiChat"
import AiChatWidget from "@/components/AiChat/AiChatWidget"
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
    const stored = JSON.parse(localStorage.getItem("id"))
    if (stored?.username) {
      setUsername(stored.username)
    }
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
    router.push("/")
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'trade', label: 'Trade' },
    { id: 'watchlist', label: 'Watchlist' },
    { id: 'markets', label: 'Markets' },
    { id: 'exchange', label: 'WazirX' },
    { id: 'ai', label: 'AI Bot' },
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
            <MarketStats />
            <Watchlist />
          </>
        )}

        {activeTab === 'trade' && (
          <>
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

        {activeTab === 'ai' && (
          <AiChat />
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
