import type { Router as RouterType } from "express";
import { RedemptionEvent } from "../../lib/eventsub";
declare const router: RouterType;
export declare const onRedemption: (callback: (event: RedemptionEvent) => void) => void;
export declare const onRevocation: (callback: (subscription: unknown) => void) => void;
export default router;
//# sourceMappingURL=webhook.d.ts.map