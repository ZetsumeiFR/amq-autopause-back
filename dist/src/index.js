"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("better-auth/node");
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = require("../lib/auth");
const webhook_1 = __importDefault(require("./routes/webhook"));
const eventsub_1 = __importDefault(require("./routes/eventsub"));
const events_1 = __importDefault(require("./routes/events"));
const subscription_manager_1 = require("../lib/subscription-manager");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// CORS configuration for Chrome extension
app.use((0, cors_1.default)({
    origin: [
        /^chrome-extension:\/\//, // Allow all Chrome extensions
        "http://localhost:3000", // Allow same-origin requests
    ],
    credentials: true, // Allow cookies for auth
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
// IMPORTANT: Webhook route needs raw body for signature verification
// This must be before any other body parsers
app.use("/webhook/twitch", express_1.default.raw({ type: "application/json" }));
// JSON parser for other routes
app.use(express_1.default.json());
// Better Auth handler - handles all /api/auth/* routes
app.all("/api/auth/*splat", (0, node_1.toNodeHandler)(auth_1.auth));
// Twitch EventSub webhook routes
app.use("/webhook", webhook_1.default);
// EventSub management API routes (for Chrome extension)
app.use("/api/eventsub", eventsub_1.default);
// Real-time events stream (SSE for Chrome extension)
app.use("/api/events", events_1.default);
// Health check
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "AMQ Autopause API" });
});
// Handle redemption events (with user context) - log for debugging
subscription_manager_1.subscriptionManager.on("redemption", (data) => {
    console.log("=== Channel Points Redemption ===");
    console.log(`App User: ${data.user.name} (${data.userId})`);
    console.log(`Viewer: ${data.event.user_name} (${data.event.user_id})`);
    console.log(`Reward: ${data.event.reward.title} (ID: ${data.event.reward.id})`);
    console.log(`Cost: ${data.event.reward.cost} points`);
    console.log(`Status: ${data.event.status}`);
    if (data.event.user_input) {
        console.log(`User Input: ${data.event.user_input}`);
    }
    console.log(`Redeemed at: ${data.event.redeemed_at}`);
    console.log("=================================");
    // Note: SSE notifications are handled by events router automatically
});
// Handle subscription revocations
subscription_manager_1.subscriptionManager.on("revocation", (data) => {
    console.warn("EventSub subscription was revoked:", data.twitchSubscriptionId);
    // TODO: Notify user to re-subscribe
});
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Auth callback URL: http://localhost:${PORT}/api/auth/callback/twitch`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook/twitch`);
    console.log(`\nAPI Endpoints:`);
    console.log(`  POST   /api/eventsub/subscribe      - Subscribe to a reward`);
    console.log(`  DELETE /api/eventsub/subscribe/:id  - Unsubscribe from a reward`);
    console.log(`  GET    /api/eventsub/subscriptions  - List user's subscriptions`);
    console.log(`  GET    /api/eventsub/twitch-info    - Get user's Twitch info`);
    console.log(`  GET    /api/eventsub/events         - Get redemption history`);
    console.log(`  GET    /api/events/stream           - SSE stream for real-time events`);
    console.log(`  GET    /api/events/stats            - Get SSE connection stats`);
    // Sync subscriptions with Twitch on startup
    if (process.env.SYNC_ON_STARTUP === "true") {
        try {
            console.log("Syncing subscriptions with Twitch...");
            await subscription_manager_1.subscriptionManager.syncWithTwitch();
        }
        catch (error) {
            console.error("Sync failed:", error);
        }
    }
});
//# sourceMappingURL=index.js.map