import { EventEmitter } from "events";
import { twitchApi } from "./twitch-api";
import { subscriptionManager } from "./subscription-manager";

// EventSub message types
export const EVENTSUB_MESSAGE_TYPE = {
  NOTIFICATION: "notification",
  WEBHOOK_CALLBACK_VERIFICATION: "webhook_callback_verification",
  REVOCATION: "revocation",
} as const;

// Channel Points Custom Reward Redemption Event
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

// EventSub webhook payload
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

// EventSub webhook headers
export interface EventSubHeaders {
  "twitch-eventsub-message-id": string;
  "twitch-eventsub-message-retry": string;
  "twitch-eventsub-message-type": string;
  "twitch-eventsub-message-signature": string;
  "twitch-eventsub-message-timestamp": string;
  "twitch-eventsub-subscription-type": string;
  "twitch-eventsub-subscription-version": string;
}

class EventSubService extends EventEmitter {
  private secret: string;
  private callbackUrl: string;
  private processedMessages: Set<string> = new Set();
  private messageCleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();

    this.secret = process.env.TWITCH_EVENTSUB_SECRET as string;
    this.callbackUrl = process.env.WEBHOOK_CALLBACK_URL as string;

    if (!this.secret) {
      console.warn(
        "TWITCH_EVENTSUB_SECRET not set - webhook signature verification will fail"
      );
    }

    if (!this.callbackUrl) {
      console.warn(
        "WEBHOOK_CALLBACK_URL not set - EventSub subscriptions will fail"
      );
    }

    // Clean up old message IDs every 10 minutes
    this.messageCleanupInterval = setInterval(
      () => {
        this.processedMessages.clear();
      },
      10 * 60 * 1000
    );
  }

  /**
   * Subscribe to channel point redemption events for a specific reward
   */
  async subscribeToRedemption(
    broadcasterId: string,
    rewardId: string
  ): Promise<void> {
    if (!this.callbackUrl || !this.secret) {
      throw new Error(
        "WEBHOOK_CALLBACK_URL and TWITCH_EVENTSUB_SECRET must be configured"
      );
    }

    await twitchApi.createRedemptionSubscription(
      broadcasterId,
      rewardId,
      this.callbackUrl,
      this.secret
    );

    console.log(
      `Subscribed to redemptions for broadcaster ${broadcasterId}, reward ${rewardId}`
    );
  }

  /**
   * Handle incoming EventSub webhook
   */
  handleWebhook(
    headers: Record<string, string>,
    body: string
  ): { response: string | object; statusCode: number } {
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
    if (
      !twitchApi.verifySignature(
        messageId,
        timestamp,
        body,
        signature,
        this.secret
      )
    ) {
      console.error("Invalid webhook signature");
      return { response: { error: "Invalid signature" }, statusCode: 403 };
    }

    // Check timestamp validity
    if (!twitchApi.isTimestampValid(timestamp)) {
      console.error("Webhook timestamp too old");
      return { response: { error: "Timestamp too old" }, statusCode: 403 };
    }

    // Check for duplicate messages
    if (this.processedMessages.has(messageId)) {
      console.log(`Duplicate message ignored: ${messageId}`);
      return { response: { status: "ok" }, statusCode: 200 };
    }
    this.processedMessages.add(messageId);

    const payload: EventSubPayload = JSON.parse(body);

    // Handle different message types
    switch (messageType) {
      case EVENTSUB_MESSAGE_TYPE.WEBHOOK_CALLBACK_VERIFICATION:
        console.log("Webhook verification challenge received");
        if (payload.challenge) {
          return { response: payload.challenge, statusCode: 200 };
        }
        return { response: { error: "No challenge" }, statusCode: 400 };

      case EVENTSUB_MESSAGE_TYPE.NOTIFICATION:
        this.handleNotification(payload).catch((err) =>
          console.error("Notification handling error:", err)
        );
        return { response: { status: "ok" }, statusCode: 200 };

      case EVENTSUB_MESSAGE_TYPE.REVOCATION:
        console.warn(
          `Subscription revoked: ${payload.subscription.id} (${payload.subscription.status})`
        );
        subscriptionManager
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
  private async handleNotification(payload: EventSubPayload): Promise<void> {
    const event = payload.event;
    if (!event) {
      console.error("Notification received without event data");
      return;
    }

    console.log(
      `Redemption received: ${event.user_name} redeemed "${event.reward.title}" for ${event.reward.cost} points`
    );

    // Update subscription status if needed (verification success)
    if (payload.subscription.status === "enabled") {
      await subscriptionManager.updateSubscriptionStatus(
        payload.subscription.id,
        "enabled"
      );
    }

    // Route to subscription manager for user-specific handling
    await subscriptionManager.handleRedemption(event);

    // Also emit raw event for backward compatibility
    this.emit("redemption", event);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.messageCleanupInterval) {
      clearInterval(this.messageCleanupInterval);
      this.messageCleanupInterval = null;
    }
    this.processedMessages.clear();
  }
}

export const eventSubService = new EventSubService();
