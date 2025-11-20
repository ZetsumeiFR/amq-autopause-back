import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

const isProduction = process.env.NODE_ENV === "production" || process.env.BETTER_AUTH_URL?.startsWith("https://");

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  trustedOrigins: [
    "http://localhost:3000",
    "https://api.amqautopause.zetsumei.xyz",
    "chrome-extension://lombcfomljhnkgljpimnjldpbbecffhi",
  ],
  advanced: {
    useSecureCookies: isProduction, // Use secure cookies for HTTPS in production
    defaultCookieAttributes: {
      sameSite: "none", // Allow cross-origin cookies from Chrome extension
      secure: isProduction, // Secure flag for HTTPS connections
    },
  },
  socialProviders: {
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID as string,
      clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
    },
  },
});
