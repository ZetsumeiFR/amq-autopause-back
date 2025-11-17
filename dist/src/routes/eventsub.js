"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const subscription_manager_1 = require("../../lib/subscription-manager");
const auth_1 = require("../../lib/auth");
const node_1 = require("better-auth/node");
const prisma_1 = require("../../lib/prisma");
const router = (0, express_1.Router)();
/**
 * Middleware to authenticate requests using better-auth session
 */
async function requireAuth(req, res, next) {
    try {
        const session = await auth_1.auth.api.getSession({
            headers: (0, node_1.fromNodeHeaders)(req.headers),
        });
        if (!session) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        // Attach user to request
        req.user = session.user;
        next();
    }
    catch (error) {
        console.error("Auth error:", error);
        res.status(401).json({ error: "Authentication failed" });
    }
}
/**
 * POST /api/eventsub/subscribe
 * Subscribe to redemption events for a specific reward
 */
router.post("/subscribe", requireAuth, async (req, res) => {
    const user = req.user;
    const { rewardId } = req.body;
    if (!rewardId) {
        res.status(400).json({ error: "rewardId is required" });
        return;
    }
    const result = await subscription_manager_1.subscriptionManager.subscribeUser(user.id, rewardId);
    if (result.success) {
        res.json({
            success: true,
            subscriptionId: result.subscriptionId,
            message: result.error || "Subscription created successfully",
        });
    }
    else {
        res.status(400).json({
            success: false,
            error: result.error,
        });
    }
});
/**
 * DELETE /api/eventsub/subscribe/:rewardId
 * Unsubscribe from a specific reward
 */
router.delete("/subscribe/:rewardId", requireAuth, async (req, res) => {
    const user = req.user;
    const { rewardId } = req.params;
    const result = await subscription_manager_1.subscriptionManager.unsubscribeUser(user.id, rewardId);
    if (result.success) {
        res.json({
            success: true,
            message: "Subscription deleted successfully",
        });
    }
    else {
        res.status(400).json({
            success: false,
            error: result.error,
        });
    }
});
/**
 * GET /api/eventsub/subscriptions
 * Get all subscriptions for the authenticated user
 */
router.get("/subscriptions", requireAuth, async (req, res) => {
    const user = req.user;
    const subscriptions = await subscription_manager_1.subscriptionManager.getUserSubscriptions(user.id);
    res.json({
        subscriptions: subscriptions.map((sub) => ({
            id: sub.id,
            rewardId: sub.rewardId,
            broadcasterId: sub.broadcasterId,
            status: sub.status,
            createdAt: sub.createdAt,
        })),
    });
});
/**
 * GET /api/eventsub/twitch-info
 * Get the user's Twitch account info
 */
router.get("/twitch-info", requireAuth, async (req, res) => {
    const user = req.user;
    const twitchInfo = await subscription_manager_1.subscriptionManager.getUserTwitchInfo(user.id);
    if (!twitchInfo) {
        res.status(404).json({ error: "No Twitch account linked" });
        return;
    }
    res.json(twitchInfo);
});
/**
 * GET /api/eventsub/events
 * Get recent redemption events for the authenticated user
 */
router.get("/events", requireAuth, async (req, res) => {
    const user = req.user;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const events = await prisma_1.prisma.redemptionEvent.findMany({
        where: { userId: user.id },
        orderBy: { redeemedAt: "desc" },
        take: limit,
    });
    res.json({ events });
});
/**
 * POST /api/eventsub/sync
 * Sync subscriptions with Twitch (admin/maintenance)
 */
router.post("/sync", requireAuth, async (_req, res) => {
    try {
        await subscription_manager_1.subscriptionManager.syncWithTwitch();
        res.json({ success: true, message: "Sync completed" });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: message });
    }
});
exports.default = router;
//# sourceMappingURL=eventsub.js.map