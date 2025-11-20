"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionManager = void 0;
const db_1 = require("./db");
const schema_1 = require("./schema");
const twitch_api_1 = require("./twitch-api");
const events_1 = require("events");
const drizzle_orm_1 = require("drizzle-orm");
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
        const accounts = await db_1.db
            .select()
            .from(schema_1.account)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.account.userId, userId), (0, drizzle_orm_1.eq)(schema_1.account.providerId, "twitch")))
            .limit(1);
        if (accounts.length === 0) {
            return null;
        }
        return {
            twitchUserId: accounts[0].accountId,
            twitchUsername: accounts[0].accountId, // We could store username separately
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
        const existing = await db_1.db
            .select()
            .from(schema_1.eventSubSubscription)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.userId, userId), (0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.rewardId, rewardId)))
            .limit(1);
        if (existing.length > 0 && existing[0].status === "enabled") {
            return {
                success: true,
                subscriptionId: existing[0].twitchSubscriptionId,
                error: "Subscription already exists",
            };
        }
        try {
            // Create Twitch EventSub subscription
            const subscription = await twitch_api_1.twitchApi.createRedemptionSubscription(twitchInfo.twitchUserId, rewardId, this.callbackUrl, this.secret);
            // Store in database
            await db_1.db
                .insert(schema_1.eventSubSubscription)
                .values({
                id: crypto.randomUUID(),
                twitchSubscriptionId: subscription.id,
                userId,
                broadcasterId: twitchInfo.twitchUserId,
                rewardId,
                status: subscription.status,
                updatedAt: new Date(),
            })
                .onConflictDoUpdate({
                target: [schema_1.eventSubSubscription.userId, schema_1.eventSubSubscription.rewardId],
                set: {
                    twitchSubscriptionId: subscription.id,
                    broadcasterId: twitchInfo.twitchUserId,
                    status: subscription.status,
                    updatedAt: new Date(),
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
        const subscription = await db_1.db
            .select()
            .from(schema_1.eventSubSubscription)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.userId, userId), (0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.rewardId, rewardId)))
            .limit(1);
        if (subscription.length === 0) {
            return {
                success: false,
                error: "Subscription not found",
            };
        }
        try {
            // Delete from Twitch
            await twitch_api_1.twitchApi.deleteSubscription(subscription[0].twitchSubscriptionId);
            // Delete from database
            await db_1.db
                .delete(schema_1.eventSubSubscription)
                .where((0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.id, subscription[0].id));
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
        return db_1.db
            .select()
            .from(schema_1.eventSubSubscription)
            .where((0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.eventSubSubscription.createdAt));
    }
    /**
     * Update subscription status (called when webhook verification succeeds/fails)
     */
    async updateSubscriptionStatus(twitchSubscriptionId, status) {
        await db_1.db
            .update(schema_1.eventSubSubscription)
            .set({ status, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.twitchSubscriptionId, twitchSubscriptionId));
        console.log(`Updated subscription ${twitchSubscriptionId} status: ${status}`);
    }
    /**
     * Handle a redemption event - find the user and store/emit the event
     */
    async handleRedemption(event) {
        // Find the subscription for this broadcaster and reward
        const subscriptions = await db_1.db
            .select()
            .from(schema_1.eventSubSubscription)
            .innerJoin(schema_1.user, (0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.userId, schema_1.user.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.broadcasterId, event.broadcaster_user_id), (0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.rewardId, event.reward.id), (0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.status, "enabled")))
            .limit(1);
        if (subscriptions.length === 0) {
            console.warn(`No active subscription found for broadcaster ${event.broadcaster_user_id}, reward ${event.reward.id}`);
            return;
        }
        const subscription = {
            ...subscriptions[0].eventsub_subscription,
            user: subscriptions[0].user,
        };
        // Store the event in database
        const storedEvent = await db_1.db
            .insert(schema_1.redemptionEvent)
            .values({
            id: crypto.randomUUID(),
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
        })
            .onConflictDoUpdate({
            target: schema_1.redemptionEvent.twitchRedemptionId,
            set: {
                status: event.status,
            },
        })
            .returning();
        const storedEventData = storedEvent[0];
        console.log(`Stored redemption event for user ${subscription.userId}: ${event.user_name} redeemed "${event.reward.title}"`);
        // Emit event with user context
        this.emit("redemption", {
            userId: subscription.userId,
            user: subscription.user,
            event,
            storedEvent: storedEventData,
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
            await db_1.db
                .update(schema_1.eventSubSubscription)
                .set({ status: twitchSub.status, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.twitchSubscriptionId, twitchSub.id));
        }
        // Mark missing subscriptions as revoked
        const dbSubs = await db_1.db
            .select()
            .from(schema_1.eventSubSubscription)
            .where((0, drizzle_orm_1.ne)(schema_1.eventSubSubscription.status, "authorization_revoked"));
        for (const dbSub of dbSubs) {
            if (!twitchSubIds.has(dbSub.twitchSubscriptionId)) {
                await db_1.db
                    .update(schema_1.eventSubSubscription)
                    .set({ status: "not_found_on_twitch", updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema_1.eventSubSubscription.id, dbSub.id));
                console.log(`Subscription ${dbSub.twitchSubscriptionId} not found on Twitch, marked as invalid`);
            }
        }
    }
}
exports.subscriptionManager = new SubscriptionManager();
//# sourceMappingURL=subscription-manager.js.map