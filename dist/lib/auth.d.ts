export declare const auth: import("better-auth/*").Auth<{
    database: (options: import("better-auth/*").BetterAuthOptions) => import("better-auth/adapters/drizzle").DBAdapter<import("better-auth/*").BetterAuthOptions>;
    trustedOrigins: string[];
    socialProviders: {
        twitch: {
            clientId: string;
            clientSecret: string;
        };
    };
}>;
//# sourceMappingURL=auth.d.ts.map