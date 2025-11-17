import crypto from "crypto";

interface AppAccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

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

interface CreateSubscriptionResponse {
  data: EventSubSubscription[];
  total: number;
  total_cost: number;
  max_total_cost: number;
}

interface ListSubscriptionsResponse {
  data: EventSubSubscription[];
  total: number;
  total_cost: number;
  max_total_cost: number;
  pagination: {
    cursor?: string;
  };
}

class TwitchApiClient {
  private clientId: string;
  private clientSecret: string;
  private appAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID as string;
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET as string;

    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set in environment variables"
      );
    }
  }

  /**
   * Get App Access Token using Client Credentials flow
   * This token is used for EventSub subscriptions
   */
  async getAppAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5 minute buffer)
    if (this.appAccessToken && Date.now() < this.tokenExpiresAt - 300000) {
      return this.appAccessToken;
    }

    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get app access token: ${error}`);
    }

    const data = (await response.json()) as AppAccessTokenResponse;
    this.appAccessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

    return this.appAccessToken;
  }

  /**
   * Create an EventSub subscription for channel point redemptions
   */
  async createRedemptionSubscription(
    broadcasterId: string,
    rewardId: string,
    callbackUrl: string,
    secret: string
  ): Promise<EventSubSubscription> {
    const token = await this.getAppAccessToken();

    const response = await fetch(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": this.clientId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "channel.channel_points_custom_reward_redemption.add",
          version: "1",
          condition: {
            broadcaster_user_id: broadcasterId,
            reward_id: rewardId,
          },
          transport: {
            method: "webhook",
            callback: callbackUrl,
            secret: secret,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create EventSub subscription: ${error}`);
    }

    const data = (await response.json()) as CreateSubscriptionResponse;
    console.log(
      `EventSub subscription created: ${data.data[0].id} (cost: ${data.total_cost}/${data.max_total_cost})`
    );
    return data.data[0];
  }

  /**
   * List all EventSub subscriptions
   */
  async listSubscriptions(): Promise<EventSubSubscription[]> {
    const token = await this.getAppAccessToken();

    const response = await fetch(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": this.clientId,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list EventSub subscriptions: ${error}`);
    }

    const data = (await response.json()) as ListSubscriptionsResponse;
    return data.data;
  }

  /**
   * Delete an EventSub subscription
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    const token = await this.getAppAccessToken();

    const response = await fetch(
      `https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscriptionId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": this.clientId,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete EventSub subscription: ${error}`);
    }

    console.log(`EventSub subscription deleted: ${subscriptionId}`);
  }

  /**
   * Verify the signature of an incoming EventSub webhook
   */
  verifySignature(
    messageId: string,
    timestamp: string,
    body: string,
    signature: string,
    secret: string
  ): boolean {
    const message = messageId + timestamp + body;
    const expectedSignature =
      "sha256=" +
      crypto.createHmac("sha256", secret).update(message).digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  }

  /**
   * Check if timestamp is within acceptable range (10 minutes)
   */
  isTimestampValid(timestamp: string): boolean {
    const messageTime = new Date(timestamp).getTime();
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;

    return Math.abs(now - messageTime) < tenMinutes;
  }
}

export const twitchApi = new TwitchApiClient();
export type { EventSubSubscription };
