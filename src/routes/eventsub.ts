import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { subscriptionManager } from "../../lib/subscription-manager";
import { auth } from "../../lib/auth";
import { fromNodeHeaders } from "better-auth/node";
import { prisma } from "../../lib/prisma";

const router: RouterType = Router();

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
 * POST /api/eventsub/subscribe
 * Subscribe to redemption events for a specific reward
 */
router.post(
  "/subscribe",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;
    const { rewardId } = req.body as { rewardId?: string };

    if (!rewardId) {
      res.status(400).json({ error: "rewardId is required" });
      return;
    }

    const result = await subscriptionManager.subscribeUser(user.id, rewardId);

    if (result.success) {
      res.json({
        success: true,
        subscriptionId: result.subscriptionId,
        message: result.error || "Subscription created successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  },
);

/**
 * DELETE /api/eventsub/subscribe/:rewardId
 * Unsubscribe from a specific reward
 */
router.delete(
  "/subscribe/:rewardId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;
    const { rewardId } = req.params;

    const result = await subscriptionManager.unsubscribeUser(user.id, rewardId);

    if (result.success) {
      res.json({
        success: true,
        message: "Subscription deleted successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  },
);

/**
 * GET /api/eventsub/subscriptions
 * Get all subscriptions for the authenticated user
 */
router.get(
  "/subscriptions",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;

    const subscriptions = await subscriptionManager.getUserSubscriptions(
      user.id,
    );

    res.json({
      subscriptions: subscriptions.map((sub) => ({
        id: sub.id,
        rewardId: sub.rewardId,
        broadcasterId: sub.broadcasterId,
        status: sub.status,
        createdAt: sub.createdAt,
      })),
    });
  },
);

/**
 * GET /api/eventsub/twitch-info
 * Get the user's Twitch account info
 */
router.get(
  "/twitch-info",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;

    const twitchInfo = await subscriptionManager.getUserTwitchInfo(user.id);

    if (!twitchInfo) {
      res.status(404).json({ error: "No Twitch account linked" });
      return;
    }

    res.json(twitchInfo);
  },
);

/**
 * GET /api/eventsub/events
 * Get recent redemption events for the authenticated user
 */
router.get(
  "/events",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const events = await prisma.redemptionEvent.findMany({
      where: { userId: user.id },
      orderBy: { redeemedAt: "desc" },
      take: limit,
    });

    res.json({ events });
  },
);

/**
 * POST /api/eventsub/sync
 * Sync subscriptions with Twitch (admin/maintenance)
 */
router.post(
  "/sync",
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await subscriptionManager.syncWithTwitch();
      res.json({ success: true, message: "Sync completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  },
);

export default router;
