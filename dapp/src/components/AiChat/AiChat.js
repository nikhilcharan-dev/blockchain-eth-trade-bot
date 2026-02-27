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
  const [builtInModels, setBuiltInModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet");
  const [showSettings, setShowSettings] = useState(false);
  const [showEnvExport, setShowEnvExport] = useState(false);
  const [settings, setSettings] = useState({});
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Custom model form
  const [newModelName, setNewModelName] = useState("");
  const [newModelId, setNewModelId] = useState("");

  const chatEndRef = useRef(null);
  const { wazirxPrices } = useCurrency();

  // Load settings on mount
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    if (s.selectedModel) setSelectedModel(s.selectedModel);
  }, []);

  // Fetch available built-in models
  useEffect(() => {
    fetch("/api/ai/chat")
      .then((r) => r.json())
      .then((data) => {
        if (data.models) setBuiltInModels(data.models);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const hasCredentials = settings.awsAccessKeyId && settings.awsSecretAccessKey;
  const customModels = settings.customModels || [];

  // All models = built-in + custom
  const allModels = [
    ...builtInModels.map((m) => ({ ...m, isCustom: false })),
    ...customModels.map((m) => ({ ...m, isCustom: true })),
  ];

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSettingsSaved(false);
  }

  function handleSaveSettings() {
    saveSettings({ ...settings, selectedModel });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  function addCustomModel() {
    const name = newModelName.trim();
    const id = newModelId.trim();
    if (!name || !id) return;

    const key = "custom-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const exists = customModels.some((m) => m.key === key || m.id === id);
    if (exists) return;

    const updated = [...customModels, { key, id, label: name, provider: "Custom" }];
    updateSetting("customModels", updated);
    setNewModelName("");
    setNewModelId("");
  }

  function removeCustomModel(key) {
    const updated = customModels.filter((m) => m.key !== key);
    updateSetting("customModels", updated);
    if (selectedModel === key) setSelectedModel("claude-sonnet");
  }

  function generateEnvContent() {
    const lines = [];
    if (settings.awsAccessKeyId) lines.push(`AWS_ACCESS_KEY_ID=${settings.awsAccessKeyId}`);
    if (settings.awsSecretAccessKey) lines.push(`AWS_SECRET_ACCESS_KEY=${settings.awsSecretAccessKey}`);
    if (settings.awsRegion) lines.push(`AWS_REGION=${settings.awsRegion}`);
    if (customModels.length > 0) {
      lines.push("");
      lines.push("# Custom Models");
      customModels.forEach((m, i) => {
        lines.push(`BEDROCK_CUSTOM_MODEL_${i}_NAME=${m.label}`);
        lines.push(`BEDROCK_CUSTOM_MODEL_${i}_ID=${m.id}`);
      });
    }
    return lines.join("\n");
  }

  function copyEnvToClipboard() {
    navigator.clipboard.writeText(generateEnvContent());
  }

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
          },
          customModels,
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

  function handleModelChange(val) {
    setSelectedModel(val);
    setSettings((prev) => ({ ...prev, selectedModel: val }));
  }

  // Group models by provider for the selector
  const groupedModels = {};
  for (const m of allModels) {
    const group = m.provider || "Other";
    if (!groupedModels[group]) groupedModels[group] = [];
    groupedModels[group].push(m);
  }

  const modelSelector = (sm) => (
    <select
      className={`ai-model-select ${sm ? "ai-model-select-sm" : ""}`}
      value={selectedModel}
      onChange={(e) => handleModelChange(e.target.value)}
    >
      {Object.entries(groupedModels).map(([provider, models]) => (
        <optgroup key={provider} label={provider}>
          {models.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}
      {allModels.length === 0 && <option value="claude-sonnet">Claude 3.5 Sonnet</option>}
    </select>
  );

  // === SETTINGS PANEL ===
  const settingsPanel = (
    <div className="ai-settings-panel">
      <div className="ai-settings-header">
        <h3>AI Bot Settings</h3>
        <button className="ai-settings-close" onClick={() => setShowSettings(false)}>
          Back to Chat
        </button>
      </div>

      {/* AWS Credentials */}
      <div className="ai-settings-section">
        <h4>AWS Credentials (Required)</h4>
        <p className="ai-settings-hint">
          AWS Console &rarr; IAM &rarr; Users &rarr; Security Credentials &rarr; Create Access Key
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

      {/* Built-in models info */}
      <div className="ai-settings-section">
        <h4>Built-in Models</h4>
        <p className="ai-settings-hint">
          These come pre-configured. Make sure to enable them in AWS Bedrock Console &rarr; Model Access.
        </p>
        <div className="ai-builtin-models-list">
          {builtInModels.map((m) => (
            <div key={m.key} className="ai-builtin-model-row">
              <span className="ai-builtin-model-provider">{m.provider}</span>
              <span className="ai-builtin-model-name">{m.label}</span>
              <span className="ai-builtin-model-id">{m.id}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom models */}
      <div className="ai-settings-section">
        <h4>Custom Models</h4>
        <p className="ai-settings-hint">
          Add any Bedrock model by its model ID. Find model IDs in AWS Bedrock Console &rarr; Foundation Models.
          For example: GPT models via Bedrock marketplace, Qwen, or any newly added model.
        </p>

        {customModels.length > 0 && (
          <div className="ai-custom-models-list">
            {customModels.map((m) => (
              <div key={m.key} className="ai-custom-model-row">
                <div className="ai-custom-model-info">
                  <span className="ai-custom-model-name">{m.label}</span>
                  <span className="ai-custom-model-id">{m.id}</span>
                </div>
                <button
                  className="ai-custom-model-remove"
                  onClick={() => removeCustomModel(m.key)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="ai-add-model-form">
          <input
            type="text"
            className="ai-settings-input"
            placeholder="Display name (e.g. GPT-4o, Qwen 2.5)"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
          />
          <input
            type="text"
            className="ai-settings-input"
            placeholder="Bedrock model ID (e.g. vendor.model-name-v1:0)"
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
          />
          <button
            className="ai-add-model-btn"
            onClick={addCustomModel}
            disabled={!newModelName.trim() || !newModelId.trim()}
          >
            + Add Model
          </button>
        </div>

        <div className="ai-model-examples">
          <span className="ai-model-examples-title">Example model IDs:</span>
          <div className="ai-model-example-chips">
            {[
              { name: "Qwen 2.5", id: "qwen.qwen2-5-72b-instruct-v1:0" },
              { name: "GPT-4o", id: "openai.gpt-4o-v1:0" },
              { name: "DeepSeek V3", id: "deepseek.deepseek-v3-v1:0" },
              { name: "Titan Premier", id: "amazon.titan-text-premier-v1:0" },
            ].map((ex) => (
              <button
                key={ex.id}
                className="ai-model-example-chip"
                onClick={() => {
                  setNewModelName(ex.name);
                  setNewModelId(ex.id);
                }}
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
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
      {/* Header — Full */}
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
            {modelSelector(false)}
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

      {/* Header — Compact */}
      {compact && (
        <div className="ai-chat-compact-header">
          <span className="ai-chat-compact-title">CryptoDash AI</span>
          <div className="ai-chat-compact-controls">
            {modelSelector(true)}
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
