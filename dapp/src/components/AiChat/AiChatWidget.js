"use client";

import { useState } from "react";
import AiChat from "./AiChat";
import "./AiChat.css";

export default function AiChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="ai-widget-wrapper">
      {open && (
        <div className="ai-widget-panel">
          <AiChat compact />
        </div>
      )}
      <button
        className="ai-widget-toggle"
        onClick={() => setOpen((o) => !o)}
        title={open ? "Close AI Chat" : "Open AI Chat"}
      >
        {open ? "✕" : "AI"}
      </button>
    </div>
  );
}
