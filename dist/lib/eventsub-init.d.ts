interface EventSubConfig {
    broadcasterId: string;
    rewardId: string;
    autoSubscribe?: boolean;
}
/**
 * Initialize EventSub service and optionally create subscriptions
 */
export declare function initializeEventSub(config: EventSubConfig): Promise<void>;
/**
 * Cleanup EventSub subscriptions for this reward
 */
export declare function cleanupEventSub(broadcasterId: string, rewardId: string): Promise<void>;
/**
 * Helper to subscribe manually (useful for setup scripts)
 */
export declare function subscribeToReward(broadcasterId: string, rewardId: string): Promise<void>;
export {};
//# sourceMappingURL=eventsub-init.d.ts.map