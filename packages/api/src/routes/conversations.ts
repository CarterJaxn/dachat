import { FastifyInstance } from "fastify";
import { db, conversations, messages } from "../db/index.js";
import { eq, asc } from "drizzle-orm";
import { WebSocket } from "ws";
import { conversationSockets, operatorSockets } from "../ws/sockets.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.get("/conversations", { preHandler: [app.authenticate] }, async (req) => {
    const { workspaceId } = req.user as { workspaceId: string };
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.workspaceId, workspaceId))
      .orderBy(conversations.updatedAt);
  });

  app.get<{ Params: { id: string } }>(
    "/conversations/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, req.params.id))
        .limit(1);
      if (!conv) return reply.status(404).send({ error: "Not found" });
      return conv;
    }
  );

  app.patch<{ Params: { id: string }; Body: { status: "open" | "closed" } }>(
    "/conversations/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const [updated] = await db
        .update(conversations)
        .set({ status: req.body.status, updatedAt: new Date() })
        .where(eq(conversations.id, req.params.id))
        .returning();
      if (!updated) return reply.status(404).send({ error: "Not found" });
      return updated;
    }
  );

  app.get<{ Params: { id: string } }>(
    "/conversations/:id/messages",
    { preHandler: [app.authenticate] },
    async (req) => {
      return db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, req.params.id))
        .orderBy(asc(messages.createdAt));
    }
  );

  // POST /conversations/:id/messages — operator reply via REST
  app.post<{ Params: { id: string }; Body: { body: string } }>(
    "/conversations/:id/messages",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { workspaceId } = req.user as { workspaceId: string };

      const [msg] = await db
        .insert(messages)
        .values({ conversationId: req.params.id, role: "operator", body: req.body.body })
        .returning();

      const outMsg = JSON.stringify({
        type: "message.new",
        message: {
          id: msg.id,
          conversationId: msg.conversationId,
          role: "operator",
          body: msg.body,
          createdAt: msg.createdAt.toISOString(),
        },
      });

      // Fan out to visitor WebSocket
      for (const ws of conversationSockets.get(req.params.id) ?? new Set()) {
        if (ws.readyState === WebSocket.OPEN) ws.send(outMsg);
      }

      // Fan out to all operator sockets on this workspace
      for (const ws of operatorSockets.get(workspaceId) ?? new Set()) {
        if (ws.readyState === WebSocket.OPEN) ws.send(outMsg);
      }

      return reply.status(201).send(msg);
    }
  );
}
