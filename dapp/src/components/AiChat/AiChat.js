"use client";

import { useState, useEffect, useRef } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import "./AiChat.css";

const QUICK_PROMPTS = [
  "What's the current market outlook?",
  "Analyze BTC price trend today",
  "Which tokens are performing best right now?",
  "Summarize ETH vs SOL today",
  "Any tokens showing bearish signals?",
];

export default function AiChat({ compact = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("claude");
  const chatEndRef = useRef(null);
  const { wazirxPrices } = useCurrency();

  // Fetch available models
  useEffect(() => {
    fetch("/api/ai/chat")
      .then((r) => r.json())
      .then((data) => {
        if (data.models) setModels(data.models);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Build market context string from live prices
  function buildMarketContext() {
    const lines = [];
    for (const [symbol, d] of Object.entries(wazirxPrices)) {
      const changeDir = d.change >= 0 ? "+" : "";
      lines.push(
        `${symbol}/INR: ₹${d.priceInr.toLocaleString("en-IN")} | 24h: ${changeDir}${d.change.toFixed(2)}% | H: ₹${d.highInr.toLocaleString("en-IN")} L: ₹${d.lowInr.toLocaleString("en-IN")} | Vol: ${d.volume.toFixed(4)}`
      );
    }
    return lines.join("\n");
  }

  async function sendMessage(text) {
    const content = (text || input).trim();
    if (!content || loading) return;

    const userMsg = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          model: selectedModel,
          marketContext: buildMarketContext(),
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: `Error: ${data.error}${data.hint ? `\n\n${data.hint}` : ""}`,
            isError: true,
          },
        ]);
      } else {
        setMessages([
          ...newMessages,
          { role: "assistant", content: data.response, model: data.model },
        ]);
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "Failed to connect to the AI service. Check your network and AWS configuration.",
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
  }

  return (
    <div className={`ai-chat ${compact ? "ai-chat-compact" : ""}`}>
      {/* Header */}
      {!compact && (
        <div className="ai-chat-header">
          <div className="ai-chat-title-row">
            <h2 className="ai-chat-title">CryptoDash AI</h2>
            <span className="ai-chat-badge">Powered by Amazon Bedrock</span>
          </div>
          <p className="ai-chat-subtitle">
            Ask about market trends, price analysis, and trading insights — powered by live WazirX data
          </p>
          <div className="ai-chat-controls">
            <select
              className="ai-model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
              {models.length === 0 && <option value="claude">Claude (Anthropic)</option>}
            </select>
            <button className="ai-clear-btn" onClick={clearChat}>
              Clear Chat
            </button>
          </div>
        </div>
      )}

      {compact && (
        <div className="ai-chat-compact-header">
          <span className="ai-chat-compact-title">CryptoDash AI</span>
          <select
            className="ai-model-select ai-model-select-sm"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
            {models.length === 0 && <option value="claude">Claude</option>}
          </select>
        </div>
      )}

      {/* Messages */}
      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-chat-empty">
            <div className="ai-chat-empty-icon">AI</div>
            <p>{compact ? "Ask me anything about the market" : "Ask me about market trends, token analysis, or trading strategies"}</p>
            {!compact && (
              <div className="ai-quick-prompts">
                {QUICK_PROMPTS.map((q, i) => (
                  <button
                    key={i}
                    className="ai-quick-prompt"
                    onClick={() => sendMessage(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`ai-msg ${m.role === "user" ? "ai-msg-user" : "ai-msg-assistant"} ${m.isError ? "ai-msg-error" : ""}`}
          >
            <div className="ai-msg-avatar">
              {m.role === "user" ? "You" : "AI"}
            </div>
            <div className="ai-msg-body">
              {m.model && <span className="ai-msg-model">{m.model}</span>}
              <div className="ai-msg-content">{m.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="ai-msg ai-msg-assistant">
            <div className="ai-msg-avatar">AI</div>
            <div className="ai-msg-body">
              <div className="ai-typing">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="ai-chat-input-row">
        <textarea
          className="ai-chat-input"
          placeholder="Ask about market trends, prices, analysis..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className="ai-send-btn"
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
