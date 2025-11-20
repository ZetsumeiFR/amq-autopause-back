import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { auth } from "../../lib/auth";
import { fromNodeHeaders } from "better-auth/node";
import { subscriptionManager } from "../../lib/subscription-manager";

const router: RouterType = Router();

// Store active SSE connections by user ID
const activeConnections = new Map<string, Set<Response>>();

/**
 * Middleware to authenticate requests using better-auth session
 */
async function requireAuth(
  req: Request,
  res: Response,
  next: () => void,
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Attach user to request
    (req as Request & { user: typeof session.user }).user = session.user;
    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
}

/**
 * GET /api/events/stream
 * Server-Sent Events stream for real-time redemption notifications
 */
router.get(
  "/stream",
  requireAuth,
  (req: Request, res: Response): void => {
    const user = (req as Request & { user: { id: string } }).user;
    const userId = user.id;

    // Set SSE headers (preserve CORS headers from middleware)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.status(200);

    // Send initial connection confirmation
    res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

    // Add this connection to active connections for this user
    if (!activeConnections.has(userId)) {
      activeConnections.set(userId, new Set());
    }
    activeConnections.get(userId)!.add(res);

    console.log(`SSE connection established for user ${userId}`);

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30000);

    // Clean up on connection close
    req.on("close", () => {
      clearInterval(heartbeatInterval);
      const userConnections = activeConnections.get(userId);
      if (userConnections) {
        userConnections.delete(res);
        if (userConnections.size === 0) {
          activeConnections.delete(userId);
        }
      }
      console.log(`SSE connection closed for user ${userId}`);
    });
  },
);

/**
 * Send event to all connections for a specific user
 */
export function sendEventToUser(
  userId: string,
  eventType: string,
  data: unknown,
): void {
  const userConnections = activeConnections.get(userId);
  if (!userConnections || userConnections.size === 0) {
    console.log(`No active connections for user ${userId}`);
    return;
  }

  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const connection of userConnections) {
    try {
      connection.write(message);
    } catch (error) {
      console.error(`Failed to send event to user ${userId}:`, error);
    }
  }

  console.log(
    `Sent ${eventType} event to ${userConnections.size} connection(s) for user ${userId}`,
  );
}

/**
 * Get connection stats
 */
router.get("/stats", (_req: Request, res: Response): void => {
  const stats = {
    totalUsers: activeConnections.size,
    connections: Array.from(activeConnections.entries()).map(
      ([userId, conns]) => ({
        userId,
        connectionCount: conns.size,
      }),
    ),
  };

  res.json(stats);
});

// Listen to redemption events from subscription manager
subscriptionManager.on("redemption", (data) => {
  // Send pause command to the user who owns this subscription
  sendEventToUser(data.userId, "pause", {
    rewardId: data.event.reward.id,
    rewardTitle: data.event.reward.title,
    viewerName: data.event.user_name,
    cost: data.event.reward.cost,
    timestamp: data.event.redeemed_at,
  });
});

export default router;
