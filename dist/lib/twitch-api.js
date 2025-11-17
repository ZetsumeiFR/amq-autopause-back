"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.twitchApi = void 0;
const crypto_1 = __importDefault(require("crypto"));
class TwitchApiClient {
    clientId;
    clientSecret;
    appAccessToken = null;
    tokenExpiresAt = 0;
    constructor() {
        this.clientId = process.env.TWITCH_CLIENT_ID;
        this.clientSecret = process.env.TWITCH_CLIENT_SECRET;
        if (!this.clientId || !this.clientSecret) {
            throw new Error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set in environment variables");
        }
    }
    /**
     * Get App Access Token using Client Credentials flow
     * This token is used for EventSub subscriptions
     */
    async getAppAccessToken() {
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
        const data = (await response.json());
        this.appAccessToken = data.access_token;
        this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
        return this.appAccessToken;
    }
    /**
     * Create an EventSub subscription for channel point redemptions
     */
    async createRedemptionSubscription(broadcasterId, rewardId, callbackUrl, secret) {
        const token = await this.getAppAccessToken();
        const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
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
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to create EventSub subscription: ${error}`);
        }
        const data = (await response.json());
        console.log(`EventSub subscription created: ${data.data[0].id} (cost: ${data.total_cost}/${data.max_total_cost})`);
        return data.data[0];
    }
    /**
     * List all EventSub subscriptions
     */
    async listSubscriptions() {
        const token = await this.getAppAccessToken();
        const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                "Client-Id": this.clientId,
            },
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to list EventSub subscriptions: ${error}`);
        }
        const data = (await response.json());
        return data.data;
    }
    /**
     * Delete an EventSub subscription
     */
    async deleteSubscription(subscriptionId) {
        const token = await this.getAppAccessToken();
        const response = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscriptionId}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${token}`,
                "Client-Id": this.clientId,
            },
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to delete EventSub subscription: ${error}`);
        }
        console.log(`EventSub subscription deleted: ${subscriptionId}`);
    }
    /**
     * Verify the signature of an incoming EventSub webhook
     */
    verifySignature(messageId, timestamp, body, signature, secret) {
        const message = messageId + timestamp + body;
        const expectedSignature = "sha256=" +
            crypto_1.default.createHmac("sha256", secret).update(message).digest("hex");
        return crypto_1.default.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    }
    /**
     * Check if timestamp is within acceptable range (10 minutes)
     */
    isTimestampValid(timestamp) {
        const messageTime = new Date(timestamp).getTime();
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        return Math.abs(now - messageTime) < tenMinutes;
    }
}
exports.twitchApi = new TwitchApiClient();
//# sourceMappingURL=twitch-api.js.map