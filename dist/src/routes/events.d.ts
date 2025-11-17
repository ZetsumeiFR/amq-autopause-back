import type { Router as RouterType } from "express";
declare const router: RouterType;
/**
 * Send event to all connections for a specific user
 */
export declare function sendEventToUser(userId: string, eventType: string, data: unknown): void;
export default router;
//# sourceMappingURL=events.d.ts.map