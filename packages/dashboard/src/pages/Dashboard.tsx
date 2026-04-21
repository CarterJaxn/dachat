import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Conversation, Message, WsOperatorServerMsg } from "@dachat/shared";
import { listConversations, listMessages } from "../api.js";
import { useOperatorSocket } from "../hooks/useOperatorSocket.js";

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

export function Dashboard({ token, onLogout }: DashboardProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listConversations(token).then(setConversations).catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!selectedId) return;
    listMessages(token, selectedId).then(setMessages).catch(console.error);
  }, [token, selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleWsMessage = useCallback((msg: WsOperatorServerMsg) => {
    if (msg.type === "conversation.new") {
      setConversations((prev) => {
        if (prev.find((c) => c.id === msg.conversation.id)) return prev;
        return [msg.conversation, ...prev];
      });
    }
    if (msg.type === "message.new") {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.message.conversationId ? { ...c, updatedAt: msg.message.createdAt } : c
        )
      );
      if (msg.message.conversationId === selectedId) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.message.id)) return prev;
          return [...prev, msg.message];
        });
      }
    }
  }, [selectedId]);

  const { sendMsg } = useOperatorSocket(token, handleWsMessage);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || !selectedId || sending) return;
    setInput("");
    setSending(true);
    sendMsg({ type: "operator.message", conversationId: selectedId, body });
    setSending(false);
  };

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.logo}>DaChat</span>
          <button onClick={onLogout} style={styles.logoutBtn} title="Sign out">⏏</button>
        </div>
        <div style={styles.sectionLabel}>Conversations</div>
        {sorted.length === 0 && (
          <p style={styles.empty}>No conversations yet.<br />Waiting for visitors…</p>
        )}
        {sorted.map((conv) => (
          <button
            key={conv.id}
            onClick={() => setSelectedId(conv.id)}
            style={{
              ...styles.convItem,
              background: conv.id === selectedId ? "#ede9fe" : "transparent",
              borderLeft: conv.id === selectedId ? "3px solid #6366f1" : "3px solid transparent",
            }}
          >
            <span style={styles.convId}>#{conv.id.slice(0, 8)}</span>
            <span
              style={{
                ...styles.convStatus,
                background: conv.status === "open" ? "#d1fae5" : "#f3f4f6",
                color: conv.status === "open" ? "#065f46" : "#6b7280",
              }}
            >
              {conv.status}
            </span>
            <span style={styles.convTime}>
              {new Date(conv.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </button>
        ))}
      </aside>

      {/* Main panel */}
      <main style={styles.main}>
        {!selected ? (
          <div style={styles.placeholder}>
            <p style={{ color: "#9ca3af", fontSize: 15 }}>Select a conversation to start replying</p>
          </div>
        ) : (
          <>
            <div style={styles.threadHeader}>
              <span style={{ fontWeight: 600 }}>Conversation</span>
              <code style={styles.convIdCode}>{selected.id}</code>
              <span
                style={{
                  ...styles.convStatus,
                  background: selected.status === "open" ? "#d1fae5" : "#f3f4f6",
                  color: selected.status === "open" ? "#065f46" : "#6b7280",
                }}
              >
                {selected.status}
              </span>
            </div>
            <div style={styles.thread}>
              {messages.length === 0 && (
                <p style={{ color: "#9ca3af", fontSize: 13, margin: "auto", alignSelf: "center" }}>
                  No messages yet.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    ...styles.bubble,
                    alignSelf: m.role === "operator" ? "flex-end" : "flex-start",
                    background: m.role === "operator" ? "#6366f1" : "#f3f4f6",
                    color: m.role === "operator" ? "#fff" : "#111827",
                  }}
                >
                  <span style={styles.bubbleRole}>{m.role === "operator" ? "You" : "Visitor"}</span>
                  {m.body}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={submit} style={styles.inputRow}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a reply…"
                style={styles.textInput}
                autoFocus
              />
              <button type="submit" disabled={!input.trim() || sending} style={styles.sendBtn}>
                Send
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: { display: "flex", height: "100vh", overflow: "hidden" },
  sidebar: {
    width: 260,
    borderRight: "1px solid #e5e7eb",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 16px 12px",
    borderBottom: "1px solid #f3f4f6",
  },
  logo: { fontWeight: 700, fontSize: 17, color: "#6366f1" },
  logoutBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    color: "#9ca3af",
    padding: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: ".05em",
    padding: "10px 16px 6px",
  },
  empty: { fontSize: 13, color: "#9ca3af", padding: "12px 16px", lineHeight: 1.6 },
  convItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 14px",
    cursor: "pointer",
    border: "none",
    width: "100%",
    textAlign: "left",
    fontSize: 13,
    borderRadius: 0,
  },
  convId: { fontFamily: "monospace", fontSize: 12, color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis" },
  convStatus: { fontSize: 11, fontWeight: 600, borderRadius: 4, padding: "2px 6px" },
  convTime: { fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fafafa" },
  placeholder: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
  threadHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 20px",
    borderBottom: "1px solid #e5e7eb",
    background: "#fff",
    fontSize: 14,
  },
  convIdCode: { fontSize: 11, color: "#6b7280", background: "#f3f4f6", borderRadius: 4, padding: "2px 6px" },
  thread: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  bubble: { borderRadius: 8, padding: "8px 12px", maxWidth: "68%", fontSize: 14, lineHeight: 1.5 },
  bubbleRole: { display: "block", fontSize: 11, fontWeight: 600, marginBottom: 2, opacity: 0.7 },
  inputRow: {
    display: "flex",
    gap: 8,
    padding: "12px 16px",
    borderTop: "1px solid #e5e7eb",
    background: "#fff",
  },
  textInput: {
    flex: 1,
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "9px 12px",
    fontSize: 14,
    outline: "none",
  },
  sendBtn: {
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};
