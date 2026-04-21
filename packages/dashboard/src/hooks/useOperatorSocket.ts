import { useEffect, useRef, useCallback } from "react";
import type { WsOperatorServerMsg } from "@dachat/shared";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "";

export function useOperatorSocket(
  token: string | null,
  onMessage: (msg: WsOperatorServerMsg) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!token) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = WS_BASE || `${proto}//${window.location.host}`;
    const ws = new WebSocket(`${host}/ws/operator?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 25_000);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsOperatorServerMsg;
        onMessageRef.current(msg);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => ws.close();

    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [token]);

  const sendMsg = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { sendMsg };
}
