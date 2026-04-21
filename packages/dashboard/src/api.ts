import type { Conversation, Message } from "@dachat/shared";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  const data = await res.json() as { token: string };
  return data.token;
}

export async function listConversations(token: string): Promise<Conversation[]> {
  const res = await fetch(`${BASE}/conversations`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to load conversations");
  return res.json() as Promise<Conversation[]>;
}

export async function listMessages(token: string, conversationId: string): Promise<Message[]> {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load messages");
  return res.json() as Promise<Message[]>;
}

export async function sendMessage(token: string, conversationId: string, body: string): Promise<Message> {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json() as Promise<Message>;
}
