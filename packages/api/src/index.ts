import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { registerAuth } from "./auth/index.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { conversationRoutes } from "./routes/conversations.js";
import { registerVisitorWs } from "./ws/visitorSession.js";
import { registerOperatorWs } from "./ws/operatorSession.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

await app.register(cors, { origin: "*" });
await app.register(jwt, { secret: process.env.JWT_SECRET! });
await app.register(websocket);

await registerAuth(app);
await app.register(workspaceRoutes);
await app.register(conversationRoutes);
await registerVisitorWs(app);
await registerOperatorWs(app);

const port = parseInt(process.env.PORT ?? "3000", 10);
await app.listen({ port, host: "0.0.0.0" });
console.log(`DaChat API listening on :${port}`);
