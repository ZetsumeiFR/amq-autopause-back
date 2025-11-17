import { EventEmitter } from "events";
export declare const EVENTSUB_MESSAGE_TYPE: {
    readonly NOTIFICATION: "notification";
    readonly WEBHOOK_CALLBACK_VERIFICATION: "webhook_callback_verification";
    readonly REVOCATION: "revocation";
};
export interface RedemptionEvent {
    id: string;
    broadcaster_user_id: string;
    broadcaster_user_login: string;
    broadcaster_user_name: string;
    user_id: string;
    user_login: string;
    user_name: string;
    user_input: string;
    status: "unfulfilled" | "fulfilled" | "canceled" | "unknown";
    reward: {
        id: string;
        title: string;
        cost: number;
        prompt: string;
    };
    redeemed_at: string;
}
export interface EventSubPayload {
    subscription: {
        id: string;
        status: string;
        type: string;
        version: string;
        condition: Record<string, string>;
        transport: {
            method: string;
            callback: string;
        };
        created_at: string;
        cost: number;
    };
    event?: RedemptionEvent;
    challenge?: string;
}
export interface EventSubHeaders {
    "twitch-eventsub-message-id": string;
    "twitch-eventsub-message-retry": string;
    "twitch-eventsub-message-type": string;
    "twitch-eventsub-message-signature": string;
    "twitch-eventsub-message-timestamp": string;
    "twitch-eventsub-subscription-type": string;
    "twitch-eventsub-subscription-version": string;
}
declare class EventSubService extends EventEmitter {
    private secret;
    private callbackUrl;
    private processedMessages;
    private messageCleanupInterval;
    constructor();
    /**
     * Subscribe to channel point redemption events for a specific reward
     */
    subscribeToRedemption(broadcasterId: string, rewardId: string): Promise<void>;
    /**
     * Handle incoming EventSub webhook
     */
    handleWebhook(headers: Record<string, string>, body: string): {
        response: string | object;
        statusCode: number;
    };
    /**
     * Process notification events
     */
    private handleNotification;
    /**
     * Cleanup resources
     */
    destroy(): void;
}
export declare const eventSubService: EventSubService;
export {};
//# sourceMappingURL=eventsub.d.ts.map