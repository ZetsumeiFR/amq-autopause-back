"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRevocation = exports.onRedemption = void 0;
const express_1 = require("express");
const eventsub_1 = require("../../lib/eventsub");
const router = (0, express_1.Router)();
/**
 * POST /webhook/twitch
 * Handles incoming EventSub webhooks from Twitch
 *
 * IMPORTANT: This endpoint must receive raw body for signature verification
 * Express must be configured with express.raw() for this route
 */
router.post("/twitch", (req, res) => {
    try {
        // Get raw body as string for signature verification
        const rawBody = typeof req.body === "string"
            ? req.body
            : Buffer.isBuffer(req.body)
                ? req.body.toString("utf8")
                : JSON.stringify(req.body);
        // Extract headers as Record<string, string>
        const headers = {};
        for (const key of Object.keys(req.headers)) {
            const value = req.headers[key];
            if (typeof value === "string") {
                headers[key] = value;
            }
            else if (Array.isArray(value)) {
                headers[key] = value[0];
            }
        }
        // Process the webhook
        const result = eventsub_1.eventSubService.handleWebhook(headers, rawBody);
        // Send response
        if (typeof result.response === "string") {
            // Challenge response must be plain text
            res.type("text/plain").status(result.statusCode).send(result.response);
        }
        else {
            res.status(result.statusCode).json(result.response);
        }
    }
    catch (error) {
        console.error("Webhook processing error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * GET /webhook/twitch
 * Health check for webhook endpoint
 */
router.get("/twitch", (_req, res) => {
    res.json({
        status: "ok",
        message: "Twitch EventSub webhook endpoint",
        timestamp: new Date().toISOString(),
    });
});
// Export event handlers for application use
const onRedemption = (callback) => {
    eventsub_1.eventSubService.on("redemption", callback);
};
exports.onRedemption = onRedemption;
const onRevocation = (callback) => {
    eventsub_1.eventSubService.on("revocation", callback);
};
exports.onRevocation = onRevocation;
exports.default = router;
//# sourceMappingURL=webhook.js.map