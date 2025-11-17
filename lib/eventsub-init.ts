import { eventSubService } from "./eventsub";
import { twitchApi } from "./twitch-api";

interface EventSubConfig {
  broadcasterId: string;
  rewardId: string;
  autoSubscribe?: boolean;
}

/**
 * Initialize EventSub service and optionally create subscriptions
 */
export async function initializeEventSub(
  config: EventSubConfig,
): Promise<void> {
  const { broadcasterId, rewardId, autoSubscribe = false } = config;

  if (!broadcasterId || !rewardId) {
    throw new Error("BROADCASTER_ID and REWARD_ID must be configured");
  }

  console.log("EventSub service initialized");
  console.log(`  Broadcaster ID: ${broadcasterId}`);
  console.log(`  Reward ID: ${rewardId}`);

  // Check existing subscriptions
  try {
    const subscriptions = await twitchApi.listSubscriptions();
    console.log(`  Existing subscriptions: ${subscriptions.length}`);

    // Check if we already have a subscription for this reward
    const existingSubscription = subscriptions.find(
      (sub) =>
        sub.type === "channel.channel_points_custom_reward_redemption.add" &&
        sub.condition.broadcaster_user_id === broadcasterId &&
        sub.condition.reward_id === rewardId &&
        sub.status === "enabled",
    );

    if (existingSubscription) {
      console.log(
        `  Found existing active subscription: ${existingSubscription.id}`,
      );
      return;
    }

    // Auto-subscribe if configured
    if (autoSubscribe) {
      console.log("  Creating new subscription...");
      await eventSubService.subscribeToRedemption(broadcasterId, rewardId);
    } else {
      console.log(
        "  Auto-subscribe disabled. Call subscribeToRedemption() manually or set autoSubscribe: true",
      );
    }
  } catch (error) {
    console.error("Failed to initialize EventSub:", error);
    throw error;
  }
}

/**
 * Cleanup EventSub subscriptions for this reward
 */
export async function cleanupEventSub(
  broadcasterId: string,
  rewardId: string,
): Promise<void> {
  const subscriptions = await twitchApi.listSubscriptions();

  const toDelete = subscriptions.filter(
    (sub) =>
      sub.type === "channel.channel_points_custom_reward_redemption.add" &&
      sub.condition.broadcaster_user_id === broadcasterId &&
      sub.condition.reward_id === rewardId,
  );

  for (const sub of toDelete) {
    await twitchApi.deleteSubscription(sub.id);
  }

  console.log(`Cleaned up ${toDelete.length} subscription(s)`);
}

/**
 * Helper to subscribe manually (useful for setup scripts)
 */
export async function subscribeToReward(
  broadcasterId: string,
  rewardId: string,
): Promise<void> {
  await eventSubService.subscribeToRedemption(broadcasterId, rewardId);
}
