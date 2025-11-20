import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: unique().on(table.email),
  }),
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    tokenUnique: unique().on(table.token),
  }),
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { mode: "date" }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const eventSubSubscription = pgTable(
  "eventsub_subscription",
  {
    id: text("id").primaryKey().notNull(),
    twitchSubscriptionId: text("twitchSubscriptionId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    broadcasterId: text("broadcasterId").notNull(),
    rewardId: text("rewardId").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
  },
  (table) => ({
    twitchSubscriptionIdUnique: unique().on(table.twitchSubscriptionId),
    userIdRewardIdUnique: unique().on(table.userId, table.rewardId),
    broadcasterIdIndex: index().on(table.broadcasterId),
  }),
);

export const redemptionEvent = pgTable(
  "redemption_event",
  {
    id: text("id").primaryKey().notNull(),
    twitchRedemptionId: text("twitchRedemptionId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    broadcasterId: text("broadcasterId").notNull(),
    broadcasterLogin: text("broadcasterLogin").notNull(),
    broadcasterName: text("broadcasterName").notNull(),
    viewerId: text("viewerId").notNull(),
    viewerLogin: text("viewerLogin").notNull(),
    viewerName: text("viewerName").notNull(),
    rewardId: text("rewardId").notNull(),
    rewardTitle: text("rewardTitle").notNull(),
    rewardCost: integer("rewardCost").notNull(),
    userInput: text("userInput"),
    status: text("status").notNull(),
    redeemedAt: timestamp("redeemedAt", { mode: "date" }).notNull(),
    processedAt: timestamp("processedAt", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    twitchRedemptionIdUnique: unique().on(table.twitchRedemptionId),
    userIdIndex: index().on(table.userId),
    broadcasterIdIndex: index().on(table.broadcasterId),
  }),
);
