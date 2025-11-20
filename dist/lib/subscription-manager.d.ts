import { EventEmitter } from "events";
import type { RedemptionEvent } from "./eventsub";
interface SubscriptionResult {
    success: boolean;
    subscriptionId?: string;
    error?: string;
}
interface UserTwitchInfo {
    twitchUserId: string;
    twitchUsername: string;
}
declare class SubscriptionManager extends EventEmitter {
    private callbackUrl;
    private secret;
    constructor();
    /**
     * Get Twitch account info for a user
     */
    getUserTwitchInfo(userId: string): Promise<UserTwitchInfo | null>;
    /**
     * Subscribe a user to redemption events for a specific reward
     */
    subscribeUser(userId: string, rewardId: string): Promise<SubscriptionResult>;
    /**
     * Unsubscribe a user from a reward
     */
    unsubscribeUser(userId: string, rewardId: string): Promise<SubscriptionResult>;
    /**
     * Get all subscriptions for a user
     */
    getUserSubscriptions(userId: string): Promise<{
        id: string;
        twitchSubscriptionId: string;
        userId: string;
        broadcasterId: string;
        rewardId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    /**
     * Update subscription status (called when webhook verification succeeds/fails)
     */
    updateSubscriptionStatus(twitchSubscriptionId: string, status: string): Promise<void>;
    /**
     * Handle a redemption event - find the user and store/emit the event
     */
    handleRedemption(event: RedemptionEvent): Promise<void>;
    /**
     * Handle subscription revocation
     */
    handleRevocation(twitchSubscriptionId: string): Promise<void>;
    /**
     * Sync database with Twitch (cleanup invalid subscriptions)
     */
    syncWithTwitch(): Promise<void>;
}
export declare const subscriptionManager: SubscriptionManager;
export {};
//# sourceMappingURL=subscription-manager.d.ts.map