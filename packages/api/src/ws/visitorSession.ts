import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { db, workspaces, contacts, conversations, messages } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import type { WsClientMsg, WsServerMsg } from "@dachat/shared";
import { conversationSockets, operatorSockets } from "./sockets.js";

function send(ws: WebSocket, msg: WsServerMsg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export async function registerVisitorWs(app: FastifyInstance) {
  app.get(
    "/ws/visitor",
    { websocket: true },
    async (socket, req) => {
      const apiKey = (req.query as Record<string, string>)["apiKey"];
      if (!apiKey) {
        send(socket, { type: "error", code: "missing_api_key", message: "apiKey query param required" });
        socket.close();
        return;
      }

      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.apiKey, apiKey))
        .limit(1);

      if (!workspace) {
        send(socket, { type: "error", code: "invalid_api_key", message: "Invalid API key" });
        socket.close();
        return;
      }

      let contactId: string | null = null;
      let conversationId: string | null = null;

      socket.on("message", async (raw) => {
        let msg: WsClientMsg;
        try {
          msg = JSON.parse(raw.toString()) as WsClientMsg;
        } catch {
          send(socket, { type: "error", code: "invalid_json", message: "Invalid JSON" });
          return;
        }

        if (msg.type === "ping") {
          send(socket, { type: "pong" });
          return;
        }

        if (msg.type === "visitor.identify") {
          let contact = msg.externalId
            ? (
                await db
                  .select()
                  .from(contacts)
                  .where(
                    and(
                      eq(contacts.workspaceId, workspace.id),
                      eq(contacts.externalId, msg.externalId)
                    )
                  )
                  .limit(1)
              )[0] ?? null
            : null;

          if (!contact) {
            const [created] = await db
              .insert(contacts)
              .values({
                workspaceId: workspace.id,
                externalId: msg.externalId,
                email: msg.email,
                name: msg.name,
              })
              .returning();
            contact = created;
          }

          contactId = contact.id;

          const [conv] = await db
            .insert(conversations)
            .values({ workspaceId: workspace.id, contactId: contact.id })
            .returning();

          conversationId = conv.id;
          conversationSockets.set(conversationId, new Set([socket]));

          // Notify all connected operators about the new conversation
          const opMsg = JSON.stringify({
            type: "conversation.new",
            conversation: {
              id: conv.id,
              workspaceId: conv.workspaceId,
              contactId: conv.contactId,
              status: conv.status,
              createdAt: conv.createdAt.toISOString(),
              updatedAt: conv.updatedAt.toISOString(),
            },
          });
          for (const ws of operatorSockets.get(workspace.id) ?? new Set()) {
            if (ws.readyState === WebSocket.OPEN) ws.send(opMsg);
          }

          send(socket, { type: "session.ready", conversationId: conv.id, contactId: contact.id });
          return;
        }

        if (msg.type === "visitor.message") {
          if (!conversationId || !contactId) {
            send(socket, { type: "error", code: "no_session", message: "Send visitor.identify first" });
            return;
          }

          const [saved] = await db
            .insert(messages)
            .values({ conversationId, role: "visitor", body: msg.body })
            .returning();

          const outMsg: WsServerMsg = {
            type: "message.new",
            message: {
              id: saved.id,
              conversationId: saved.conversationId,
              role: "visitor",
              body: saved.body,
              createdAt: saved.createdAt.toISOString(),
            },
          };

          // Fan out to all sockets on this conversation (includes operator sockets subscribed per-conversation)
          for (const ws of conversationSockets.get(conversationId) ?? new Set()) {
            send(ws, outMsg);
          }

          // Also notify workspace-level operator sockets
          const opMsg = JSON.stringify(outMsg);
          for (const ws of operatorSockets.get(workspace.id) ?? new Set()) {
            if (ws.readyState === WebSocket.OPEN) ws.send(opMsg);
          }
        }
      });

      socket.on("close", () => {
        if (conversationId) {
          const sockets = conversationSockets.get(conversationId);
          sockets?.delete(socket);
          if (sockets?.size === 0) conversationSockets.delete(conversationId);
        }
      });
    }
  );
}
