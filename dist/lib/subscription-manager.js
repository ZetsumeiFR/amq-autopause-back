"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionManager = void 0;
const prisma_1 = require("./prisma");
const twitch_api_1 = require("./twitch-api");
const events_1 = require("events");
class SubscriptionManager extends events_1.EventEmitter {
    callbackUrl;
    secret;
    constructor() {
        super();
        this.callbackUrl = process.env.WEBHOOK_CALLBACK_URL || "";
        this.secret = process.env.TWITCH_EVENTSUB_SECRET || "";
    }
    /**
     * Get Twitch account info for a user
     */
    async getUserTwitchInfo(userId) {
        const account = await prisma_1.prisma.account.findFirst({
            where: {
                userId,
                providerId: "twitch",
            },
        });
        if (!account) {
            return null;
        }
        return {
            twitchUserId: account.accountId,
            twitchUsername: account.accountId, // We could store username separately
        };
    }
    /**
     * Subscribe a user to redemption events for a specific reward
     */
    async subscribeUser(userId, rewardId) {
        if (!this.callbackUrl || !this.secret) {
            return {
                success: false,
                error: "Server not configured for EventSub (missing callback URL or secret)",
            };
        }
        // Get user's Twitch account
        const twitchInfo = await this.getUserTwitchInfo(userId);
        if (!twitchInfo) {
            return {
                success: false,
                error: "User does not have a linked Twitch account",
            };
        }
        // Check if subscription already exists
        const existing = await prisma_1.prisma.eventSubSubscription.findUnique({
            where: {
                userId_rewardId: {
                    userId,
                    rewardId,
                },
            },
        });
        if (existing && existing.status === "enabled") {
            return {
                success: true,
                subscriptionId: existing.twitchSubscriptionId,
                error: "Subscription already exists",
            };
        }
        try {
            // Create Twitch EventSub subscription
            const subscription = await twitch_api_1.twitchApi.createRedemptionSubscription(twitchInfo.twitchUserId, rewardId, this.callbackUrl, this.secret);
            // Store in database
            await prisma_1.prisma.eventSubSubscription.upsert({
                where: {
                    userId_rewardId: {
                        userId,
                        rewardId,
                    },
                },
                update: {
                    twitchSubscriptionId: subscription.id,
                    broadcasterId: twitchInfo.twitchUserId,
                    status: subscription.status,
                },
                create: {
                    twitchSubscriptionId: subscription.id,
                    userId,
                    broadcasterId: twitchInfo.twitchUserId,
                    rewardId,
                    status: subscription.status,
                },
            });
            console.log(`Created subscription for user ${userId}, reward ${rewardId}`);
            return {
                success: true,
                subscriptionId: subscription.id,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            console.error(`Failed to create subscription: ${message}`);
            return {
                success: false,
                error: message,
            };
        }
    }
    /**
     * Unsubscribe a user from a reward
     */
    async unsubscribeUser(userId, rewardId) {
        const subscription = await prisma_1.prisma.eventSubSubscription.findUnique({
            where: {
                userId_rewardId: {
                    userId,
                    rewardId,
                },
            },
        });
        if (!subscription) {
            return {
                success: false,
                error: "Subscription not found",
            };
        }
        try {
            // Delete from Twitch
            await twitch_api_1.twitchApi.deleteSubscription(subscription.twitchSubscriptionId);
            // Delete from database
            await prisma_1.prisma.eventSubSubscription.delete({
                where: { id: subscription.id },
            });
            console.log(`Deleted subscription for user ${userId}, reward ${rewardId}`);
            return { success: true };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            console.error(`Failed to delete subscription: ${message}`);
            return {
                success: false,
                error: message,
            };
        }
    }
    /**
     * Get all subscriptions for a user
     */
    async getUserSubscriptions(userId) {
        return prisma_1.prisma.eventSubSubscription.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });
    }
    /**
     * Update subscription status (called when webhook verification succeeds/fails)
     */
    async updateSubscriptionStatus(twitchSubscriptionId, status) {
        await prisma_1.prisma.eventSubSubscription.update({
            where: { twitchSubscriptionId },
            data: { status },
        });
        console.log(`Updated subscription ${twitchSubscriptionId} status: ${status}`);
    }
    /**
     * Handle a redemption event - find the user and store/emit the event
     */
    async handleRedemption(event) {
        // Find the subscription for this broadcaster and reward
        const subscription = await prisma_1.prisma.eventSubSubscription.findFirst({
            where: {
                broadcasterId: event.broadcaster_user_id,
                rewardId: event.reward.id,
                status: "enabled",
            },
            include: {
                user: true,
            },
        });
        if (!subscription) {
            console.warn(`No active subscription found for broadcaster ${event.broadcaster_user_id}, reward ${event.reward.id}`);
            return;
        }
        // Store the event in database
        const storedEvent = await prisma_1.prisma.redemptionEvent.upsert({
            where: {
                twitchRedemptionId: event.id,
            },
            update: {
                status: event.status,
            },
            create: {
                twitchRedemptionId: event.id,
                userId: subscription.userId,
                broadcasterId: event.broadcaster_user_id,
                broadcasterLogin: event.broadcaster_user_login,
                broadcasterName: event.broadcaster_user_name,
                viewerId: event.user_id,
                viewerLogin: event.user_login,
                viewerName: event.user_name,
                rewardId: event.reward.id,
                rewardTitle: event.reward.title,
                rewardCost: event.reward.cost,
                userInput: event.user_input || null,
                status: event.status,
                redeemedAt: new Date(event.redeemed_at),
            },
        });
        console.log(`Stored redemption event for user ${subscription.userId}: ${event.user_name} redeemed "${event.reward.title}"`);
        // Emit event with user context
        this.emit("redemption", {
            userId: subscription.userId,
            user: subscription.user,
            event,
            storedEvent,
        });
    }
    /**
     * Handle subscription revocation
     */
    async handleRevocation(twitchSubscriptionId) {
        await this.updateSubscriptionStatus(twitchSubscriptionId, "authorization_revoked");
        this.emit("revocation", { twitchSubscriptionId });
    }
    /**
     * Sync database with Twitch (cleanup invalid subscriptions)
     */
    async syncWithTwitch() {
        const twitchSubs = await twitch_api_1.twitchApi.listSubscriptions();
        const twitchSubIds = new Set(twitchSubs.map((s) => s.id));
        // Update statuses from Twitch
        for (const twitchSub of twitchSubs) {
            await prisma_1.prisma.eventSubSubscription.updateMany({
                where: { twitchSubscriptionId: twitchSub.id },
                data: { status: twitchSub.status },
            });
        }
        // Mark missing subscriptions as revoked
        const dbSubs = await prisma_1.prisma.eventSubSubscription.findMany({
            where: {
                status: { not: "authorization_revoked" },
            },
        });
        for (const dbSub of dbSubs) {
            if (!twitchSubIds.has(dbSub.twitchSubscriptionId)) {
                await prisma_1.prisma.eventSubSubscription.update({
                    where: { id: dbSub.id },
                    data: { status: "not_found_on_twitch" },
                });
                console.log(`Subscription ${dbSub.twitchSubscriptionId} not found on Twitch, marked as invalid`);
            }
        }
    }
}
exports.subscriptionManager = new SubscriptionManager();
//# sourceMappingURL=subscription-manager.js.map