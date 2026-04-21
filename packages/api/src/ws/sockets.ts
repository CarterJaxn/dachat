import { WebSocket } from "ws";

// conversationId → all sockets subscribed to that conversation (visitor + operator)
export const conversationSockets = new Map<string, Set<WebSocket>>();

// workspaceId → all operator sockets watching that workspace
export const operatorSockets = new Map<string, Set<WebSocket>>();
