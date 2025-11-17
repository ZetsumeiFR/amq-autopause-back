import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: [
    "http://localhost:3000",
    "chrome-extension://lombcfomljhnkgljpimnjldpbbecffhi",
  ],
  socialProviders: {
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID as string,
      clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
    },
  },
});
