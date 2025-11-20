import { toNodeHandler } from "better-auth/node";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { auth } from "../lib/auth";
import webhookRouter from "./routes/webhook";
import eventsubRouter from "./routes/eventsub";
import eventsRouter from "./routes/events";
import { subscriptionManager } from "../lib/subscription-manager";

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration for Chrome extension
app.use(cors({
  origin: [
    /^chrome-extension:\/\//,  // Allow all Chrome extensions
    "http://localhost:3000",   // Allow same-origin requests
  ],
  credentials: true,           // Allow cookies for auth
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Type", "Cache-Control", "Connection"], // Expose SSE headers
}));

// IMPORTANT: Webhook route needs raw body for signature verification
// This must be before any other body parsers
app.use("/webhook/twitch", express.raw({ type: "application/json" }));

// JSON parser for other routes
app.use(express.json());

// Better Auth handler - handles all /api/auth/* routes
app.all("/api/auth/*splat", toNodeHandler(auth));

// Twitch EventSub webhook routes
app.use("/webhook", webhookRouter);

// EventSub management API routes (for Chrome extension)
app.use("/api/eventsub", eventsubRouter);

// Real-time events stream (SSE for Chrome extension)
app.use("/api/events", eventsRouter);

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "AMQ Autopause API" });
});

// Handle redemption events (with user context) - log for debugging
subscriptionManager.on("redemption", (data) => {
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
subscriptionManager.on("revocation", (data) => {
  console.warn(
    "EventSub subscription was revoked:",
    data.twitchSubscriptionId
  );
  // TODO: Notify user to re-subscribe
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `Auth callback URL: http://localhost:${PORT}/api/auth/callback/twitch`
  );
  console.log(`Webhook URL: http://localhost:${PORT}/webhook/twitch`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  POST   /api/eventsub/subscribe      - Subscribe to a reward`);
  console.log(
    `  DELETE /api/eventsub/subscribe/:id  - Unsubscribe from a reward`
  );
  console.log(`  GET    /api/eventsub/subscriptions  - List user's subscriptions`);
  console.log(`  GET    /api/eventsub/twitch-info    - Get user's Twitch info`);
  console.log(`  GET    /api/eventsub/events         - Get redemption history`);
  console.log(`  GET    /api/events/stream           - SSE stream for real-time events`);
  console.log(`  GET    /api/events/stats            - Get SSE connection stats`);

  // Sync subscriptions with Twitch on startup
  if (process.env.SYNC_ON_STARTUP === "true") {
    try {
      console.log("Syncing subscriptions with Twitch...");
      await subscriptionManager.syncWithTwitch();
    } catch (error) {
      console.error("Sync failed:", error);
    }
  }
});
