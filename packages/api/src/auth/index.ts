import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db, workspaces, operatorSessions } from "../db/index.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerAuth(app: FastifyInstance) {
  // Operator JWT auth — decorate app.authenticate
  app.decorate(
    "authenticate",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
      } catch {
        reply.status(401).send({ error: "Unauthorized" });
      }
    }
  );

  const loginBody = z.object({ email: z.string().email(), password: z.string() });

  // POST /auth/login — exchange email+password for JWT
  app.post("/auth/login", async (req, reply) => {
    const { email, password } = loginBody.parse(req.body);
    const [session] = await db
      .select()
      .from(operatorSessions)
      .where(eq(operatorSessions.email, email))
      .limit(1);

    if (!session || !(await bcrypt.compare(password, session.passwordHash))) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const token = app.jwt.sign(
      { workspaceId: session.workspaceId, email: session.email },
      { expiresIn: "7d" }
    );
    return { token };
  });

  // POST /auth/register — create operator account (no auth guard for MVP)
  app.post("/auth/register", async (req, reply) => {
    const body = z
      .object({
        workspaceId: z.string().uuid(),
        email: z.string().email(),
        password: z.string().min(8),
      })
      .parse(req.body);

    const hash = await bcrypt.hash(body.password, 10);
    const [session] = await db
      .insert(operatorSessions)
      .values({ workspaceId: body.workspaceId, email: body.email, passwordHash: hash })
      .returning();

    return reply.status(201).send({ id: session.id, email: session.email });
  });
}
