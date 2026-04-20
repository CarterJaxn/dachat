import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { db, workspaces, contacts, conversations, messages } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import type { WsClientMsg, WsServerMsg } from "@dachat/shared";

// Map conversationId → Set<WebSocket> for operator fanout
export const conversationSockets = new Map<string, Set<WebSocket>>();

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
          // Upsert contact
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

          // Open a new conversation
          const [conv] = await db
            .insert(conversations)
            .values({ workspaceId: workspace.id, contactId: contact.id })
            .returning();

          conversationId = conv.id;
          conversationSockets.set(conversationId, new Set([socket]));

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

          // Fan out to all sockets on this conversation (includes operator sockets)
          const sockets = conversationSockets.get(conversationId) ?? new Set();
          for (const ws of sockets) {
            send(ws, outMsg);
          }
        }
      });

      socket.on("close", () => {
        if (conversationId) {
          const sockets = conversationSockets.get(conversationId);
          sockets?.delete(socket);
          if (sockets?.size === 0) {
            conversationSockets.delete(conversationId);
          }
        }
      });
    }
  );
}
