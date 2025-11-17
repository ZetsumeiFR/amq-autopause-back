"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeEventSub = initializeEventSub;
exports.cleanupEventSub = cleanupEventSub;
exports.subscribeToReward = subscribeToReward;
const eventsub_1 = require("./eventsub");
const twitch_api_1 = require("./twitch-api");
/**
 * Initialize EventSub service and optionally create subscriptions
 */
async function initializeEventSub(config) {
    const { broadcasterId, rewardId, autoSubscribe = false } = config;
    if (!broadcasterId || !rewardId) {
        throw new Error("BROADCASTER_ID and REWARD_ID must be configured");
    }
    console.log("EventSub service initialized");
    console.log(`  Broadcaster ID: ${broadcasterId}`);
    console.log(`  Reward ID: ${rewardId}`);
    // Check existing subscriptions
    try {
        const subscriptions = await twitch_api_1.twitchApi.listSubscriptions();
        console.log(`  Existing subscriptions: ${subscriptions.length}`);
        // Check if we already have a subscription for this reward
        const existingSubscription = subscriptions.find((sub) => sub.type === "channel.channel_points_custom_reward_redemption.add" &&
            sub.condition.broadcaster_user_id === broadcasterId &&
            sub.condition.reward_id === rewardId &&
            sub.status === "enabled");
        if (existingSubscription) {
            console.log(`  Found existing active subscription: ${existingSubscription.id}`);
            return;
        }
        // Auto-subscribe if configured
        if (autoSubscribe) {
            console.log("  Creating new subscription...");
            await eventsub_1.eventSubService.subscribeToRedemption(broadcasterId, rewardId);
        }
        else {
            console.log("  Auto-subscribe disabled. Call subscribeToRedemption() manually or set autoSubscribe: true");
        }
    }
    catch (error) {
        console.error("Failed to initialize EventSub:", error);
        throw error;
    }
}
/**
 * Cleanup EventSub subscriptions for this reward
 */
async function cleanupEventSub(broadcasterId, rewardId) {
    const subscriptions = await twitch_api_1.twitchApi.listSubscriptions();
    const toDelete = subscriptions.filter((sub) => sub.type === "channel.channel_points_custom_reward_redemption.add" &&
        sub.condition.broadcaster_user_id === broadcasterId &&
        sub.condition.reward_id === rewardId);
    for (const sub of toDelete) {
        await twitch_api_1.twitchApi.deleteSubscription(sub.id);
    }
    console.log(`Cleaned up ${toDelete.length} subscription(s)`);
}
/**
 * Helper to subscribe manually (useful for setup scripts)
 */
async function subscribeToReward(broadcasterId, rewardId) {
    await eventsub_1.eventSubService.subscribeToRedemption(broadcasterId, rewardId);
}
//# sourceMappingURL=eventsub-init.js.map