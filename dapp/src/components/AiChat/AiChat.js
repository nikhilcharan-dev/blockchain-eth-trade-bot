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

const SETTINGS_KEY = "ai_bot_settings";

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export default function AiChat({ compact = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("claude");
  const [showSettings, setShowSettings] = useState(false);
  const [showEnvExport, setShowEnvExport] = useState(false);
  const [settings, setSettings] = useState({});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const chatEndRef = useRef(null);
  const { wazirxPrices } = useCurrency();

  // Load settings on mount
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

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

  // Check if credentials are configured
  const hasCredentials = settings.awsAccessKeyId && settings.awsSecretAccessKey;

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSettingsSaved(false);
  }

  function handleSaveSettings() {
    saveSettings(settings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  function generateEnvContent() {
    const lines = [];
    if (settings.awsAccessKeyId) lines.push(`AWS_ACCESS_KEY_ID=${settings.awsAccessKeyId}`);
    if (settings.awsSecretAccessKey) lines.push(`AWS_SECRET_ACCESS_KEY=${settings.awsSecretAccessKey}`);
    if (settings.awsRegion) lines.push(`AWS_REGION=${settings.awsRegion}`);
    if (settings.claudeModelId) lines.push(`BEDROCK_CLAUDE_MODEL_ID=${settings.claudeModelId}`);
    if (settings.llamaModelId) lines.push(`BEDROCK_LLAMA_MODEL_ID=${settings.llamaModelId}`);
    if (settings.mistralModelId) lines.push(`BEDROCK_MISTRAL_MODEL_ID=${settings.mistralModelId}`);
    return lines.join("\n");
  }

  function copyEnvToClipboard() {
    navigator.clipboard.writeText(generateEnvContent());
  }

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

    if (!hasCredentials) {
      setShowSettings(true);
      return;
    }

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
          credentials: {
            awsAccessKeyId: settings.awsAccessKeyId,
            awsSecretAccessKey: settings.awsSecretAccessKey,
            awsRegion: settings.awsRegion || "us-east-1",
            claudeModelId: settings.claudeModelId,
            llamaModelId: settings.llamaModelId,
            mistralModelId: settings.mistralModelId,
          },
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

  // === SETTINGS PANEL ===
  const settingsPanel = (
    <div className="ai-settings-panel">
      <div className="ai-settings-header">
        <h3>AI Bot Settings</h3>
        <button className="ai-settings-close" onClick={() => setShowSettings(false)}>
          Back to Chat
        </button>
      </div>

      <div className="ai-settings-section">
        <h4>AWS Credentials (Required)</h4>
        <p className="ai-settings-hint">
          Get these from AWS Console → IAM → Users → Security Credentials → Create Access Key
        </p>
        <div className="ai-settings-fields">
          <label className="ai-settings-label">
            <span>Access Key ID</span>
            <input
              type="password"
              className="ai-settings-input"
              placeholder="AKIA..."
              value={settings.awsAccessKeyId || ""}
              onChange={(e) => updateSetting("awsAccessKeyId", e.target.value)}
            />
          </label>
          <label className="ai-settings-label">
            <span>Secret Access Key</span>
            <input
              type="password"
              className="ai-settings-input"
              placeholder="Your secret key"
              value={settings.awsSecretAccessKey || ""}
              onChange={(e) => updateSetting("awsSecretAccessKey", e.target.value)}
            />
          </label>
          <label className="ai-settings-label">
            <span>Region</span>
            <select
              className="ai-settings-input"
              value={settings.awsRegion || "us-east-1"}
              onChange={(e) => updateSetting("awsRegion", e.target.value)}
            >
              <option value="us-east-1">US East (N. Virginia)</option>
              <option value="us-west-2">US West (Oregon)</option>
              <option value="eu-west-1">EU (Ireland)</option>
              <option value="eu-central-1">EU (Frankfurt)</option>
              <option value="ap-south-1">Asia Pacific (Mumbai)</option>
              <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
              <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
            </select>
          </label>
        </div>
      </div>

      <div className="ai-settings-section">
        <h4>Custom Model IDs (Optional)</h4>
        <p className="ai-settings-hint">
          Override default Bedrock model IDs. Leave blank to use defaults.
        </p>
        <div className="ai-settings-fields">
          <label className="ai-settings-label">
            <span>Claude Model ID</span>
            <input
              type="text"
              className="ai-settings-input"
              placeholder="anthropic.claude-3-5-sonnet-20241022-v2:0"
              value={settings.claudeModelId || ""}
              onChange={(e) => updateSetting("claudeModelId", e.target.value)}
            />
          </label>
          <label className="ai-settings-label">
            <span>Llama Model ID</span>
            <input
              type="text"
              className="ai-settings-input"
              placeholder="meta.llama3-1-70b-instruct-v1:0"
              value={settings.llamaModelId || ""}
              onChange={(e) => updateSetting("llamaModelId", e.target.value)}
            />
          </label>
          <label className="ai-settings-label">
            <span>Mistral Model ID</span>
            <input
              type="text"
              className="ai-settings-input"
              placeholder="mistral.mistral-large-2407-v1:0"
              value={settings.mistralModelId || ""}
              onChange={(e) => updateSetting("mistralModelId", e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="ai-settings-actions">
        <button className="ai-settings-save" onClick={handleSaveSettings}>
          {settingsSaved ? "Saved!" : "Save Settings"}
        </button>
        <button
          className="ai-settings-export"
          onClick={() => setShowEnvExport(!showEnvExport)}
        >
          {showEnvExport ? "Hide .env" : "Export as .env"}
        </button>
      </div>

      {showEnvExport && (
        <div className="ai-env-export">
          <div className="ai-env-export-header">
            <span>Copy this into your hosting platform&apos;s environment variables</span>
            <button className="ai-env-copy-btn" onClick={copyEnvToClipboard}>
              Copy
            </button>
          </div>
          <pre className="ai-env-block">{generateEnvContent() || "# No settings configured yet"}</pre>
        </div>
      )}

      <p className="ai-settings-note">
        Credentials are stored in your browser&apos;s localStorage and sent securely to the
        Next.js server for Bedrock API calls. They are never stored on any external server.
      </p>
    </div>
  );

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
            <button
              className={`ai-settings-btn ${hasCredentials ? "" : "ai-settings-btn-warn"}`}
              onClick={() => setShowSettings(!showSettings)}
            >
              {showSettings ? "Chat" : "Settings"}
            </button>
          </div>
          {!hasCredentials && !showSettings && (
            <div className="ai-credentials-banner">
              AWS credentials not configured.
              <button onClick={() => setShowSettings(true)}>Open Settings</button>
              to add your keys.
            </div>
          )}
        </div>
      )}

      {compact && (
        <div className="ai-chat-compact-header">
          <span className="ai-chat-compact-title">CryptoDash AI</span>
          <div className="ai-chat-compact-controls">
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
            <button
              className="ai-settings-btn-sm"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              {showSettings ? "Chat" : "Cfg"}
            </button>
          </div>
        </div>
      )}

      {/* Settings or Chat */}
      {showSettings ? (
        settingsPanel
      ) : (
        <>
          {/* Messages */}
          <div className="ai-chat-messages">
            {messages.length === 0 && (
              <div className="ai-chat-empty">
                <div className="ai-chat-empty-icon">AI</div>
                <p>{compact ? "Ask me anything about the market" : "Ask me about market trends, token analysis, or trading strategies"}</p>
                {!compact && hasCredentials && (
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
                {!compact && !hasCredentials && (
                  <button
                    className="ai-quick-prompt"
                    onClick={() => setShowSettings(true)}
                  >
                    Configure AWS credentials to get started
                  </button>
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
              placeholder={hasCredentials ? "Ask about market trends, prices, analysis..." : "Configure AWS keys in Settings first..."}
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
        </>
      )}
    </div>
  );
}
