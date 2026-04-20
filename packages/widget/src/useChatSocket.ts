import { useEffect, useRef, useCallback, useState } from "react";
import type { WsClientMsg, WsServerMsg, Message } from "@dachat/shared";

interface UseChatSocketOptions {
  apiUrl: string;
  apiKey: string;
  visitor?: { externalId?: string; email?: string; name?: string };
}

export function useChatSocket({ apiUrl, apiKey, visitor }: UseChatSocketOptions) {
  const ws = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const send = useCallback((msg: WsClientMsg) => {
    ws.current?.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    const socket = new WebSocket(`${apiUrl.replace(/^http/, "ws")}/ws/visitor?apiKey=${apiKey}`);
    ws.current = socket;

    socket.addEventListener("open", () => {
      setConnected(true);
      socket.send(JSON.stringify({ type: "visitor.identify", ...visitor } satisfies WsClientMsg));
    });

    socket.addEventListener("message", (event) => {
      const msg: WsServerMsg = JSON.parse(event.data as string);
      if (msg.type === "session.ready") {
        setConversationId(msg.conversationId);
      } else if (msg.type === "message.new") {
        setMessages((prev) => [...prev, msg.message]);
      }
    });

    socket.addEventListener("close", () => setConnected(false));

    return () => socket.close();
  }, [apiUrl, apiKey]);

  const sendMessage = useCallback(
    (body: string) => send({ type: "visitor.message", body }),
    [send]
  );

  return { messages, connected, conversationId, sendMessage };
}
