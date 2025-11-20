import { and, desc, eq, ne } from "drizzle-orm";
import { EventEmitter } from "events";
import { db } from "./db";
import type { RedemptionEvent } from "./eventsub";
import { account, eventSubSubscription, redemptionEvent, user } from "./schema";
import { twitchApi } from "./twitch-api";

interface SubscriptionResult {
  success: boolean;
  subscriptionId?: string;
  error?: string;
}

interface UserTwitchInfo {
  twitchUserId: string;
  twitchUsername: string;
}

class SubscriptionManager extends EventEmitter {
  private callbackUrl: string;
  private secret: string;

  constructor() {
    super();
    this.callbackUrl = process.env.WEBHOOK_CALLBACK_URL || "";
    this.secret = process.env.TWITCH_EVENTSUB_SECRET || "";
  }

  /**
   * Get Twitch account info for a user
   */
  async getUserTwitchInfo(userId: string): Promise<UserTwitchInfo | null> {
    const accounts = await db
      .select()
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "twitch")))
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
  async subscribeUser(
    userId: string,
    rewardId: string,
  ): Promise<SubscriptionResult> {
    if (!this.callbackUrl || !this.secret) {
      return {
        success: false,
        error:
          "Server not configured for EventSub (missing callback URL or secret)",
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
    const existing = await db
      .select()
      .from(eventSubSubscription)
      .where(
        and(
          eq(eventSubSubscription.userId, userId),
          eq(eventSubSubscription.rewardId, rewardId),
        ),
      )
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
      const subscription = await twitchApi.createRedemptionSubscription(
        twitchInfo.twitchUserId,
        rewardId,
        this.callbackUrl,
        this.secret,
      );

      // Store in database
      await db
        .insert(eventSubSubscription)
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
          target: [eventSubSubscription.userId, eventSubSubscription.rewardId],
          set: {
            twitchSubscriptionId: subscription.id,
            broadcasterId: twitchInfo.twitchUserId,
            status: subscription.status,
            updatedAt: new Date(),
          },
        });

      console.log(
        `Created subscription for user ${userId}, reward ${rewardId}`,
      );

      return {
        success: true,
        subscriptionId: subscription.id,
      };
    } catch (error) {
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
  async unsubscribeUser(
    userId: string,
    rewardId: string,
  ): Promise<SubscriptionResult> {
    const subscription = await db
      .select()
      .from(eventSubSubscription)
      .where(
        and(
          eq(eventSubSubscription.userId, userId),
          eq(eventSubSubscription.rewardId, rewardId),
        ),
      )
      .limit(1);

    if (subscription.length === 0) {
      return {
        success: false,
        error: "Subscription not found",
      };
    }

    try {
      // Delete from Twitch
      await twitchApi.deleteSubscription(subscription[0].twitchSubscriptionId);

      // Delete from database
      await db
        .delete(eventSubSubscription)
        .where(eq(eventSubSubscription.id, subscription[0].id));

      console.log(
        `Deleted subscription for user ${userId}, reward ${rewardId}`,
      );

      return { success: true };
    } catch (error) {
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
  async getUserSubscriptions(userId: string) {
    return db
      .select()
      .from(eventSubSubscription)
      .where(eq(eventSubSubscription.userId, userId))
      .orderBy(desc(eventSubSubscription.createdAt));
  }

  /**
   * Update subscription status (called when webhook verification succeeds/fails)
   */
  async updateSubscriptionStatus(
    twitchSubscriptionId: string,
    status: string,
  ): Promise<void> {
    await db
      .update(eventSubSubscription)
      .set({ status, updatedAt: new Date() })
      .where(
        eq(eventSubSubscription.twitchSubscriptionId, twitchSubscriptionId),
      );

    console.log(
      `Updated subscription ${twitchSubscriptionId} status: ${status}`,
    );
  }

  /**
   * Handle a redemption event - find the user and store/emit the event
   */
  async handleRedemption(event: RedemptionEvent): Promise<void> {
    // Find the subscription for this broadcaster and reward
    const subscriptions = await db
      .select()
      .from(eventSubSubscription)
      .innerJoin(user, eq(eventSubSubscription.userId, user.id))
      .where(
        and(
          eq(eventSubSubscription.broadcasterId, event.broadcaster_user_id),
          eq(eventSubSubscription.rewardId, event.reward.id),
          eq(eventSubSubscription.status, "enabled"),
        ),
      )
      .limit(1);

    if (subscriptions.length === 0) {
      console.warn(
        `No active subscription found for broadcaster ${event.broadcaster_user_id}, reward ${event.reward.id}`,
      );
      return;
    }

    const subscription = {
      ...subscriptions[0].eventsub_subscription,
      user: subscriptions[0].user,
    };

    // Store the event in database
    const storedEvent = await db
      .insert(redemptionEvent)
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
        target: redemptionEvent.twitchRedemptionId,
        set: {
          status: event.status,
        },
      })
      .returning();

    const storedEventData = storedEvent[0];

    console.log(
      `Stored redemption event for user ${subscription.userId}: ${event.user_name} redeemed "${event.reward.title}"`,
    );

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
  async handleRevocation(twitchSubscriptionId: string): Promise<void> {
    await this.updateSubscriptionStatus(
      twitchSubscriptionId,
      "authorization_revoked",
    );

    this.emit("revocation", { twitchSubscriptionId });
  }

  /**
   * Sync database with Twitch (cleanup invalid subscriptions)
   */
  async syncWithTwitch(): Promise<void> {
    const twitchSubs = await twitchApi.listSubscriptions();
    const twitchSubIds = new Set(twitchSubs.map((s) => s.id));

    // Update statuses from Twitch
    for (const twitchSub of twitchSubs) {
      await db
        .update(eventSubSubscription)
        .set({ status: twitchSub.status, updatedAt: new Date() })
        .where(eq(eventSubSubscription.twitchSubscriptionId, twitchSub.id));
    }

    // Mark missing subscriptions as revoked
    const dbSubs = await db
      .select()
      .from(eventSubSubscription)
      .where(ne(eventSubSubscription.status, "authorization_revoked"));

    for (const dbSub of dbSubs) {
      if (!twitchSubIds.has(dbSub.twitchSubscriptionId)) {
        await db
          .update(eventSubSubscription)
          .set({ status: "not_found_on_twitch", updatedAt: new Date() })
          .where(eq(eventSubSubscription.id, dbSub.id));
        console.log(
          `Subscription ${dbSub.twitchSubscriptionId} not found on Twitch, marked as invalid`,
        );
      }
    }
  }
}

export const subscriptionManager = new SubscriptionManager();
