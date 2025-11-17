-- CreateTable
CREATE TABLE "eventsub_subscription" (
    "id" TEXT NOT NULL,
    "twitchSubscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "broadcasterId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventsub_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemption_event" (
    "id" TEXT NOT NULL,
    "twitchRedemptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "broadcasterId" TEXT NOT NULL,
    "broadcasterLogin" TEXT NOT NULL,
    "broadcasterName" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewerLogin" TEXT NOT NULL,
    "viewerName" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "rewardTitle" TEXT NOT NULL,
    "rewardCost" INTEGER NOT NULL,
    "userInput" TEXT,
    "status" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemption_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eventsub_subscription_twitchSubscriptionId_key" ON "eventsub_subscription"("twitchSubscriptionId");

-- CreateIndex
CREATE INDEX "eventsub_subscription_broadcasterId_idx" ON "eventsub_subscription"("broadcasterId");

-- CreateIndex
CREATE UNIQUE INDEX "eventsub_subscription_userId_rewardId_key" ON "eventsub_subscription"("userId", "rewardId");

-- CreateIndex
CREATE UNIQUE INDEX "redemption_event_twitchRedemptionId_key" ON "redemption_event"("twitchRedemptionId");

-- CreateIndex
CREATE INDEX "redemption_event_userId_idx" ON "redemption_event"("userId");

-- CreateIndex
CREATE INDEX "redemption_event_broadcasterId_idx" ON "redemption_event"("broadcasterId");

-- AddForeignKey
ALTER TABLE "eventsub_subscription" ADD CONSTRAINT "eventsub_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_event" ADD CONSTRAINT "redemption_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
