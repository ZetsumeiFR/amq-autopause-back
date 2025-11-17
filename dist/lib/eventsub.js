"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventSubService = exports.EVENTSUB_MESSAGE_TYPE = void 0;
const events_1 = require("events");
const twitch_api_1 = require("./twitch-api");
const subscription_manager_1 = require("./subscription-manager");
// EventSub message types
exports.EVENTSUB_MESSAGE_TYPE = {
    NOTIFICATION: "notification",
    WEBHOOK_CALLBACK_VERIFICATION: "webhook_callback_verification",
    REVOCATION: "revocation",
};
class EventSubService extends events_1.EventEmitter {
    secret;
    callbackUrl;
    processedMessages = new Set();
    messageCleanupInterval = null;
    constructor() {
        super();
        this.secret = process.env.TWITCH_EVENTSUB_SECRET;
        this.callbackUrl = process.env.WEBHOOK_CALLBACK_URL;
        if (!this.secret) {
            console.warn("TWITCH_EVENTSUB_SECRET not set - webhook signature verification will fail");
        }
        if (!this.callbackUrl) {
            console.warn("WEBHOOK_CALLBACK_URL not set - EventSub subscriptions will fail");
        }
        // Clean up old message IDs every 10 minutes
        this.messageCleanupInterval = setInterval(() => {
            this.processedMessages.clear();
        }, 10 * 60 * 1000);
    }
    /**
     * Subscribe to channel point redemption events for a specific reward
     */
    async subscribeToRedemption(broadcasterId, rewardId) {
        if (!this.callbackUrl || !this.secret) {
            throw new Error("WEBHOOK_CALLBACK_URL and TWITCH_EVENTSUB_SECRET must be configured");
        }
        await twitch_api_1.twitchApi.createRedemptionSubscription(broadcasterId, rewardId, this.callbackUrl, this.secret);
        console.log(`Subscribed to redemptions for broadcaster ${broadcasterId}, reward ${rewardId}`);
    }
    /**
     * Handle incoming EventSub webhook
     */
    handleWebhook(headers, body) {
        const messageId = headers["twitch-eventsub-message-id"];
        const timestamp = headers["twitch-eventsub-message-timestamp"];
        const messageType = headers["twitch-eventsub-message-type"];
        const signature = headers["twitch-eventsub-message-signature"];
        // Validate required headers
        if (!messageId || !timestamp || !messageType || !signature) {
            console.error("Missing required EventSub headers");
            return { response: { error: "Missing headers" }, statusCode: 400 };
        }
        // Verify signature
        if (!twitch_api_1.twitchApi.verifySignature(messageId, timestamp, body, signature, this.secret)) {
            console.error("Invalid webhook signature");
            return { response: { error: "Invalid signature" }, statusCode: 403 };
        }
        // Check timestamp validity
        if (!twitch_api_1.twitchApi.isTimestampValid(timestamp)) {
            console.error("Webhook timestamp too old");
            return { response: { error: "Timestamp too old" }, statusCode: 403 };
        }
        // Check for duplicate messages
        if (this.processedMessages.has(messageId)) {
            console.log(`Duplicate message ignored: ${messageId}`);
            return { response: { status: "ok" }, statusCode: 200 };
        }
        this.processedMessages.add(messageId);
        const payload = JSON.parse(body);
        // Handle different message types
        switch (messageType) {
            case exports.EVENTSUB_MESSAGE_TYPE.WEBHOOK_CALLBACK_VERIFICATION:
                console.log("Webhook verification challenge received");
                if (payload.challenge) {
                    return { response: payload.challenge, statusCode: 200 };
                }
                return { response: { error: "No challenge" }, statusCode: 400 };
            case exports.EVENTSUB_MESSAGE_TYPE.NOTIFICATION:
                this.handleNotification(payload).catch((err) => console.error("Notification handling error:", err));
                return { response: { status: "ok" }, statusCode: 200 };
            case exports.EVENTSUB_MESSAGE_TYPE.REVOCATION:
                console.warn(`Subscription revoked: ${payload.subscription.id} (${payload.subscription.status})`);
                subscription_manager_1.subscriptionManager
                    .handleRevocation(payload.subscription.id)
                    .catch((err) => console.error("Revocation handling error:", err));
                this.emit("revocation", payload.subscription);
                return { response: { status: "ok" }, statusCode: 200 };
            default:
                console.warn(`Unknown message type: ${messageType}`);
                return { response: { status: "ok" }, statusCode: 200 };
        }
    }
    /**
     * Process notification events
     */
    async handleNotification(payload) {
        const event = payload.event;
        if (!event) {
            console.error("Notification received without event data");
            return;
        }
        console.log(`Redemption received: ${event.user_name} redeemed "${event.reward.title}" for ${event.reward.cost} points`);
        // Update subscription status if needed (verification success)
        if (payload.subscription.status === "enabled") {
            await subscription_manager_1.subscriptionManager.updateSubscriptionStatus(payload.subscription.id, "enabled");
        }
        // Route to subscription manager for user-specific handling
        await subscription_manager_1.subscriptionManager.handleRedemption(event);
        // Also emit raw event for backward compatibility
        this.emit("redemption", event);
    }
    /**
     * Cleanup resources
     */
    destroy() {
        if (this.messageCleanupInterval) {
            clearInterval(this.messageCleanupInterval);
            this.messageCleanupInterval = null;
        }
        this.processedMessages.clear();
    }
}
exports.eventSubService = new EventSubService();
//# sourceMappingURL=eventsub.js.map