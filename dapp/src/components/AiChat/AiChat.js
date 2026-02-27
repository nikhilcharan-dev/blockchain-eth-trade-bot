"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useCurrency } from "@/context/CurrencyContext";
import "./AiChat.css";

const QUICK_PROMPTS = [
  "What's the current market outlook?",
  "Analyze BTC price trend today",
  "Which tokens are performing best right now?",
  "Summarize ETH vs SOL today",
  "Any tokens showing bearish signals?",
  "Give me a portfolio overview",
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sync state
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState(""); // "", "synced", "error"
  const [isGuest, setIsGuest] = useState(true);

  // Custom model form
  const [newModelName, setNewModelName] = useState("");
  const [newModelId, setNewModelId] = useState("");

  const chatEndRef = useRef(null);
  const { wazirxPrices } = useCurrency();

  // Check if logged-in user (not guest)
  useEffect(() => {
    try {
      const id = JSON.parse(localStorage.getItem("id") || "{}");
      setIsGuest(!id.username || id.username === "Guest");
    } catch {
      setIsGuest(true);
    }
  }, []);

  // Pull settings from cloud
  const pullCloudSettings = useCallback(async () => {
    try {
      const resp = await fetch("/api/settings");
      if (!resp.ok) return null;
      const data = await resp.json();
      return data;
    } catch {
      return null;
    }
  }, []);

  // Push settings to cloud
  const pushCloudSettings = useCallback(async (s, model) => {
    setSyncLoading(true);
    try {
      const resp = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccessKeyId: s.awsAccessKeyId || "",
          awsSecretAccessKey: s.awsSecretAccessKey || "",
          awsRegion: s.awsRegion || "us-east-1",
          selectedModel: model,
          customModels: s.customModels || [],
          modelOverrides: s.modelOverrides || {},
          wazirxApiKey: localStorage.getItem("wazirx_api_key") || "",
          wazirxApiSecret: localStorage.getItem("wazirx_api_secret") || "",
          syncEnabled: true,
        }),
      });
      if (resp.ok) {
        setSyncStatus("synced");
        setTimeout(() => setSyncStatus(""), 2000);
      }
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus(""), 3000);
    } finally {
      setSyncLoading(false);
    }
  }, []);

  // Load settings on mount — try cloud first, then localStorage
  useEffect(() => {
    const localSettings = loadSettings();

    if (isGuest) {
      setSettings(localSettings);
      if (localSettings.selectedModel) setSelectedModel(localSettings.selectedModel);
      return;
    }

    // Try cloud settings
    pullCloudSettings().then((cloud) => {
      if (cloud?.syncEnabled && cloud.settings) {
        const cs = cloud.settings;
        setSyncEnabled(true);

        // Merge cloud settings
        const merged = {
          awsAccessKeyId: cs.awsAccessKeyId || localSettings.awsAccessKeyId || "",
          awsSecretAccessKey: cs.awsSecretAccessKey || localSettings.awsSecretAccessKey || "",
          awsRegion: cs.awsRegion || localSettings.awsRegion || "us-east-1",
          customModels: cs.customModels?.length > 0 ? cs.customModels : localSettings.customModels || [],
          modelOverrides: cs.modelOverrides && Object.keys(cs.modelOverrides).length > 0
            ? cs.modelOverrides
            : localSettings.modelOverrides || {},
        };

        setSettings(merged);
        saveSettings(merged);

        if (cs.selectedModel) setSelectedModel(cs.selectedModel);
        else if (localSettings.selectedModel) setSelectedModel(localSettings.selectedModel);

        // Restore WazirX keys if synced
        if (cs.wazirxApiKey) localStorage.setItem("wazirx_api_key", cs.wazirxApiKey);
        if (cs.wazirxApiSecret) localStorage.setItem("wazirx_api_secret", cs.wazirxApiSecret);
      } else {
        setSettings(localSettings);
        if (localSettings.selectedModel) setSelectedModel(localSettings.selectedModel);
      }
    });
  }, [isGuest, pullCloudSettings]);

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

    // Push to cloud if sync is enabled
    if (syncEnabled && !isGuest) {
      pushCloudSettings(settings, selectedModel);
    }
  }

  async function toggleSync() {
    if (isGuest) return;

    if (syncEnabled) {
      // Disable sync
      setSyncLoading(true);
      try {
        await fetch("/api/settings", { method: "DELETE" });
        setSyncEnabled(false);
        setSyncStatus("");
      } catch {}
      setSyncLoading(false);
    } else {
      // Enable sync — push current settings
      setSyncEnabled(true);
      await pushCloudSettings(settings, selectedModel);
    }
  }

  async function pullFromCloud() {
    if (isGuest) return;
    setSyncLoading(true);
    const cloud = await pullCloudSettings();
    if (cloud?.settings) {
      const cs = cloud.settings;
      const merged = {
        awsAccessKeyId: cs.awsAccessKeyId || "",
        awsSecretAccessKey: cs.awsSecretAccessKey || "",
        awsRegion: cs.awsRegion || "us-east-1",
        customModels: cs.customModels || [],
        modelOverrides: cs.modelOverrides || {},
      };
      setSettings(merged);
      saveSettings(merged);
      if (cs.selectedModel) setSelectedModel(cs.selectedModel);
      if (cs.wazirxApiKey) localStorage.setItem("wazirx_api_key", cs.wazirxApiKey);
      if (cs.wazirxApiSecret) localStorage.setItem("wazirx_api_secret", cs.wazirxApiSecret);
      setSyncStatus("synced");
      setTimeout(() => setSyncStatus(""), 2000);
    }
    setSyncLoading(false);
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

  // Built-in model ID overrides
  const modelOverrides = settings.modelOverrides || {};

  function getModelOverride(key) {
    return modelOverrides[key] || "";
  }

  function setModelOverride(key, value) {
    updateSetting("modelOverrides", { ...modelOverrides, [key]: value });
  }

  function clearModelOverride(key) {
    const updated = { ...modelOverrides };
    delete updated[key];
    updateSetting("modelOverrides", updated);
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
          modelOverrides,
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
        <h3>Settings</h3>
        <button className="ai-settings-back" onClick={() => setShowSettings(false)}>
          Back to Chat
        </button>
      </div>

      {/* AWS Credentials */}
      <div className="ai-settings-section">
        <h4>AWS Credentials</h4>
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

      {/* Built-in models — editable IDs */}
      <div className="ai-settings-section">
        <h4>Built-in Models</h4>
        <p className="ai-settings-hint">
          Pre-configured models. Edit the model ID to use a different version or cross-region inference profile.
          Enable models in AWS Bedrock Console &rarr; Model Access.
        </p>
        <div className="ai-builtin-models-list">
          {builtInModels.map((m) => (
            <div
              key={m.key}
              className={`ai-builtin-model-row ${getModelOverride(m.key) ? "ai-builtin-model-modified" : ""}`}
            >
              <span className="ai-builtin-model-provider">{m.provider}</span>
              <span className="ai-builtin-model-name">{m.label}</span>
              <div className="ai-builtin-model-id-wrapper">
                <input
                  type="text"
                  className="ai-builtin-model-id-input"
                  value={getModelOverride(m.key) || m.id}
                  onChange={(e) => setModelOverride(m.key, e.target.value)}
                  title="Edit model ID"
                />
                {getModelOverride(m.key) && (
                  <button
                    className="ai-model-reset-btn"
                    onClick={() => clearModelOverride(m.key)}
                    title="Reset to default"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom models */}
      <div className="ai-settings-section">
        <h4>Custom Models</h4>
        <p className="ai-settings-hint">
          Add any Bedrock model by its model ID. Find IDs in AWS Bedrock Console &rarr; Foundation Models.
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
          <span className="ai-model-examples-title">Quick fill:</span>
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
            <span>Copy into your hosting environment variables</span>
            <button className="ai-env-copy-btn" onClick={copyEnvToClipboard}>
              Copy
            </button>
          </div>
          <pre className="ai-env-block">{generateEnvContent() || "# No settings configured yet"}</pre>
        </div>
      )}

      {/* Sync to Account */}
      {!isGuest && (
        <div className="ai-settings-section ai-sync-section">
          <h4>Sync to Account</h4>
          <p className="ai-settings-hint">
            Save your settings (AWS keys, models, WazirX keys) to your account so you can access
            them from any device.
          </p>
          <div className="ai-sync-toggle-row">
            <span className="ai-sync-label">Cloud Sync</span>
            <button
              className={`ai-sync-toggle-btn ${syncEnabled ? "ai-sync-on" : ""}`}
              onClick={toggleSync}
              disabled={syncLoading}
            >
              <span className="ai-sync-toggle-knob" />
            </button>
            <span className="ai-sync-status-text">
              {syncLoading ? "Syncing..." : syncEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          {syncEnabled && (
            <div className="ai-sync-actions">
              <button
                className="ai-sync-action-btn"
                onClick={() => pushCloudSettings(settings, selectedModel)}
                disabled={syncLoading}
              >
                Push to Cloud
              </button>
              <button
                className="ai-sync-action-btn ai-sync-pull-btn"
                onClick={pullFromCloud}
                disabled={syncLoading}
              >
                Pull from Cloud
              </button>
            </div>
          )}
          {syncStatus === "synced" && (
            <span className="ai-sync-msg ai-sync-ok">Settings synced to your account</span>
          )}
          {syncStatus === "error" && (
            <span className="ai-sync-msg ai-sync-err">Sync failed. Try again.</span>
          )}
        </div>
      )}

      <p className="ai-settings-note">
        Credentials are stored in your browser&apos;s localStorage.
        {syncEnabled
          ? " They are also securely synced to your account in the cloud."
          : " Enable Cloud Sync to access settings from any device."}
      </p>
    </div>
  );

  // ==========================================================
  // RENDER
  // ==========================================================
  return (
    <div className={`ai-chat ${compact ? "ai-chat-compact" : ""} ${!compact && sidebarOpen ? "ai-sidebar-open" : ""}`}>
      {/* ===== SIDEBAR (full page only) ===== */}
      {!compact && sidebarOpen && (
        <aside className="ai-sidebar">
          <div className="ai-sidebar-top">
            <div className="ai-sidebar-brand">
              <div className="ai-sidebar-logo">AI</div>
              <div>
                <div className="ai-sidebar-title">CryptoDash AI</div>
                <div className="ai-sidebar-subtitle">Powered by Bedrock</div>
              </div>
            </div>
            <button className="ai-new-chat-btn" onClick={clearChat}>
              + New Chat
            </button>
          </div>

          <div className="ai-sidebar-body">
            <div className="ai-sidebar-section">
              <span className="ai-sidebar-label">Model</span>
              {modelSelector(false)}
            </div>

            {hasCredentials && (
              <div className="ai-sidebar-section">
                <span className="ai-sidebar-label">Suggestions</span>
                <div className="ai-sidebar-prompts">
                  {QUICK_PROMPTS.map((q, i) => (
                    <button
                      key={i}
                      className="ai-sidebar-prompt"
                      onClick={() => sendMessage(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="ai-sidebar-footer">
            {!hasCredentials && (
              <div className="ai-cred-warning">
                AWS credentials required
              </div>
            )}
            <button
              className={`ai-sidebar-settings-btn ${!hasCredentials ? "ai-sidebar-settings-warn" : ""}`}
              onClick={() => setShowSettings(!showSettings)}
            >
              {showSettings ? "Back to Chat" : "Settings"}
            </button>
          </div>
        </aside>
      )}

      {/* ===== MAIN AREA ===== */}
      <div className="ai-main">
        {/* Full-page header with sidebar toggle */}
        {!compact && (
          <div className="ai-main-header">
            <button
              className="ai-sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="1" y="2" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <line x1="6.5" y1="2" x2="6.5" y2="16" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <span className="ai-main-header-title">CryptoDash AI</span>
            <div className="ai-main-header-controls">
              {modelSelector(true)}
              <button
                className="ai-main-settings-btn"
                onClick={() => setShowSettings(!showSettings)}
              >
                {showSettings ? "Chat" : "Settings"}
              </button>
            </div>
          </div>
        )}

        {/* Compact header */}
        {compact && (
          <div className="ai-compact-header">
            <span className="ai-compact-title">CryptoDash AI</span>
            <div className="ai-compact-controls">
              {modelSelector(true)}
              <button
                className="ai-compact-cfg-btn"
                onClick={() => setShowSettings(!showSettings)}
              >
                {showSettings ? "Chat" : "Cfg"}
              </button>
            </div>
          </div>
        )}

        {/* Content: Settings or Chat */}
        {showSettings ? (
          settingsPanel
        ) : (
          <>
            {/* Messages */}
            <div className="ai-messages">
              {messages.length === 0 && (
                <div className="ai-empty-state">
                  <div className="ai-empty-icon">AI</div>
                  <h3 className="ai-empty-title">
                    {compact ? "Ask anything" : "How can I help you today?"}
                  </h3>
                  <p className="ai-empty-sub">
                    {compact
                      ? "Market analysis with live data"
                      : "AI-powered crypto market analysis with real-time WazirX data"}
                  </p>

                  {!compact && hasCredentials && (
                    <div className="ai-empty-grid">
                      {QUICK_PROMPTS.slice(0, 4).map((q, i) => (
                        <button
                          key={i}
                          className="ai-empty-card"
                          onClick={() => sendMessage(q)}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}

                  {!compact && !hasCredentials && (
                    <button
                      className="ai-empty-setup"
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
                  className={`ai-message ${
                    m.role === "user" ? "ai-message-user" : "ai-message-ai"
                  } ${m.isError ? "ai-message-error" : ""}`}
                >
                  <div className="ai-message-row">
                    <div className="ai-message-avatar">
                      {m.role === "user" ? "Y" : "AI"}
                    </div>
                    <div className="ai-message-body">
                      <div className="ai-message-meta">
                        <span className="ai-message-role">
                          {m.role === "user" ? "You" : "CryptoDash AI"}
                        </span>
                        {m.model && (
                          <span className="ai-message-model">{m.model}</span>
                        )}
                      </div>
                      <div className="ai-message-content">
                        {m.role === "assistant" && !m.isError ? (
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        ) : (
                          m.content
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="ai-message ai-message-ai">
                  <div className="ai-message-row">
                    <div className="ai-message-avatar">AI</div>
                    <div className="ai-message-body">
                      <div className="ai-message-meta">
                        <span className="ai-message-role">CryptoDash AI</span>
                      </div>
                      <div className="ai-typing">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="ai-input-area">
              <div className="ai-input-wrapper">
                <textarea
                  className="ai-input"
                  placeholder={
                    hasCredentials
                      ? "Message CryptoDash AI..."
                      : "Configure AWS keys in Settings first..."
                  }
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
                  {loading ? (
                    <span className="ai-send-dots">...</span>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M2 8L14 8M14 8L9 3M14 8L9 13"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
              {!compact && (
                <p className="ai-disclaimer">
                  AI analysis is not financial advice. Always do your own research.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
