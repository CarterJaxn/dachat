import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { db, conversations, messages } from "../db/index.js";
import { eq } from "drizzle-orm";
import type { WsOperatorClientMsg, WsOperatorServerMsg } from "@dachat/shared";
import { operatorSockets, conversationSockets } from "./sockets.js";

function send(ws: WebSocket, msg: WsOperatorServerMsg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export async function registerOperatorWs(app: FastifyInstance) {
  app.get(
    "/ws/operator",
    { websocket: true },
    async (socket, req) => {
      const token = (req.query as Record<string, string>)["token"];
      if (!token) {
        send(socket, { type: "error", code: "missing_token", message: "token query param required" });
        socket.close();
        return;
      }

      let workspaceId: string;
      try {
        const payload = app.jwt.verify<{ workspaceId: string }>(token);
        workspaceId = payload.workspaceId;
      } catch {
        send(socket, { type: "error", code: "invalid_token", message: "Invalid or expired token" });
        socket.close();
        return;
      }

      if (!operatorSockets.has(workspaceId)) operatorSockets.set(workspaceId, new Set());
      operatorSockets.get(workspaceId)!.add(socket);

      send(socket, { type: "connected", workspaceId });

      socket.on("message", async (raw) => {
        let msg: WsOperatorClientMsg;
        try {
          msg = JSON.parse(raw.toString()) as WsOperatorClientMsg;
        } catch {
          send(socket, { type: "error", code: "invalid_json", message: "Invalid JSON" });
          return;
        }

        if (msg.type === "ping") {
          send(socket, { type: "pong" });
          return;
        }

        if (msg.type === "operator.message") {
          const [conv] = await db
            .select()
            .from(conversations)
            .where(eq(conversations.id, msg.conversationId))
            .limit(1);

          if (!conv || conv.workspaceId !== workspaceId) {
            send(socket, { type: "error", code: "not_found", message: "Conversation not found" });
            return;
          }

          const [saved] = await db
            .insert(messages)
            .values({ conversationId: msg.conversationId, role: "operator", body: msg.body })
            .returning();

          const outMsg: WsOperatorServerMsg = {
            type: "message.new",
            message: {
              id: saved.id,
              conversationId: saved.conversationId,
              role: "operator",
              body: saved.body,
              createdAt: saved.createdAt.toISOString(),
            },
          };

          // Echo to all operator sockets on this workspace
          for (const ws of operatorSockets.get(workspaceId) ?? new Set()) {
            send(ws, outMsg);
          }

          // Fan out to visitor WebSocket on this conversation
          const visitorMsg = JSON.stringify({ type: "message.new", message: outMsg.message });
          for (const ws of conversationSockets.get(msg.conversationId) ?? new Set()) {
            if (ws.readyState === WebSocket.OPEN) ws.send(visitorMsg);
          }
        }
      });

      socket.on("close", () => {
        const sockets = operatorSockets.get(workspaceId);
        sockets?.delete(socket);
        if (sockets?.size === 0) operatorSockets.delete(workspaceId);
      });
    }
  );
}
