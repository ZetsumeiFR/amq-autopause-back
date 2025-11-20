"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
const better_auth_1 = require("better-auth");
const drizzle_1 = require("better-auth/adapters/drizzle");
const db_1 = require("./db");
exports.auth = (0, better_auth_1.betterAuth)({
    database: (0, drizzle_1.drizzleAdapter)(db_1.db, {
        provider: "pg",
    }),
    trustedOrigins: [
        "http://localhost:3000",
        "chrome-extension://lombcfomljhnkgljpimnjldpbbecffhi",
    ],
    socialProviders: {
        twitch: {
            clientId: process.env.TWITCH_CLIENT_ID,
            clientSecret: process.env.TWITCH_CLIENT_SECRET,
        },
    },
});
//# sourceMappingURL=auth.js.map