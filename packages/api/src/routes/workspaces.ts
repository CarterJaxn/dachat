import { FastifyInstance } from "fastify";
import { db, workspaces } from "../db/index.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";

const createBody = z.object({ name: z.string().min(1) });

export async function workspaceRoutes(app: FastifyInstance) {
  // POST /workspaces — provision a new workspace
  app.post("/workspaces", async (req, reply) => {
    const body = createBody.parse(req.body);
    const apiKey = `wk_${randomBytes(24).toString("hex")}`;
    const [ws] = await db.insert(workspaces).values({ name: body.name, apiKey }).returning();
    return reply.status(201).send(ws);
  });

  // GET /workspaces/:id
  app.get<{ Params: { id: string } }>("/workspaces/:id", async (req, reply) => {
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, req.params.id))
      .limit(1);
    if (!ws) return reply.status(404).send({ error: "Not found" });
    return ws;
  });
}
