import React, { useState, useRef, useEffect } from "react";
import { useChatSocket } from "./useChatSocket.js";

interface ChatWidgetProps {
  apiUrl: string;
  apiKey: string;
  accentColor?: string;
}

export function ChatWidget({ apiUrl, apiKey, accentColor = "#6366f1" }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, connected, sendMessage } = useChatSocket({ apiUrl, apiKey });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed || !connected) return;
    sendMessage(trimmed);
    setInput("");
  };

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, fontFamily: "system-ui, sans-serif" }}>
      {open && (
        <div style={{
          width: 360, height: 500, display: "flex", flexDirection: "column",
          background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,.18)",
          marginBottom: 12, overflow: "hidden", border: "1px solid #e5e7eb"
        }}>
          <div style={{ background: accentColor, color: "#fff", padding: "14px 16px", fontWeight: 600, fontSize: 15 }}>
            Chat with us
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.length === 0 && (
              <p style={{ color: "#9ca3af", fontSize: 13, margin: "auto", textAlign: "center" }}>
                Send us a message to start a conversation.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} style={{
                alignSelf: m.role === "visitor" ? "flex-end" : "flex-start",
                background: m.role === "visitor" ? accentColor : "#f3f4f6",
                color: m.role === "visitor" ? "#fff" : "#111",
                borderRadius: 8, padding: "8px 12px", maxWidth: "75%", fontSize: 14
              }}>
                {m.body}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div style={{ display: "flex", borderTop: "1px solid #e5e7eb", padding: 8, gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={connected ? "Type a message…" : "Connecting…"}
              disabled={!connected}
              style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 10px", fontSize: 14, outline: "none" }}
            />
            <button
              onClick={submit}
              disabled={!connected}
              style={{
                background: accentColor, color: "#fff", border: "none", borderRadius: 6,
                padding: "8px 14px", fontSize: 14, cursor: "pointer", fontWeight: 600
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 56, height: 56, borderRadius: "50%", background: accentColor,
          border: "none", color: "#fff", fontSize: 24, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,.2)", float: "right"
        }}
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
