interface EventSubSubscription {
    id: string;
    status: string;
    type: string;
    version: string;
    condition: Record<string, string>;
    created_at: string;
    transport: {
        method: string;
        callback: string;
    };
    cost: number;
}
declare class TwitchApiClient {
    private clientId;
    private clientSecret;
    private appAccessToken;
    private tokenExpiresAt;
    constructor();
    /**
     * Get App Access Token using Client Credentials flow
     * This token is used for EventSub subscriptions
     */
    getAppAccessToken(): Promise<string>;
    /**
     * Create an EventSub subscription for channel point redemptions
     */
    createRedemptionSubscription(broadcasterId: string, rewardId: string, callbackUrl: string, secret: string): Promise<EventSubSubscription>;
    /**
     * List all EventSub subscriptions
     */
    listSubscriptions(): Promise<EventSubSubscription[]>;
    /**
     * Delete an EventSub subscription
     */
    deleteSubscription(subscriptionId: string): Promise<void>;
    /**
     * Verify the signature of an incoming EventSub webhook
     */
    verifySignature(messageId: string, timestamp: string, body: string, signature: string, secret: string): boolean;
    /**
     * Check if timestamp is within acceptable range (10 minutes)
     */
    isTimestampValid(timestamp: string): boolean;
}
export declare const twitchApi: TwitchApiClient;
export type { EventSubSubscription };
//# sourceMappingURL=twitch-api.d.ts.map