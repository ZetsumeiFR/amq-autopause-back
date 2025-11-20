import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  trustedOrigins: [
    "http://localhost:3000",
    "chrome-extension://lombcfomljhnkgljpimnjldpbbecffhi",
  ],
  advanced: {
    useSecureCookies: false, // Allow cookies over HTTP for localhost dev
    defaultCookieAttributes: {
      sameSite: "none", // Allow cross-origin cookies from Chrome extension
      secure: false, // Must be false for HTTP localhost
    },
  },
  socialProviders: {
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID as string,
      clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
    },
  },
});
