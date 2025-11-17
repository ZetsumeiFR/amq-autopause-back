import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { eventSubService, RedemptionEvent } from "../../lib/eventsub";

const router: RouterType = Router();

/**
 * POST /webhook/twitch
 * Handles incoming EventSub webhooks from Twitch
 *
 * IMPORTANT: This endpoint must receive raw body for signature verification
 * Express must be configured with express.raw() for this route
 */
router.post("/twitch", (req: Request, res: Response) => {
  try {
    // Get raw body as string for signature verification
    const rawBody =
      typeof req.body === "string"
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : JSON.stringify(req.body);

    // Extract headers as Record<string, string>
    const headers: Record<string, string> = {};
    for (const key of Object.keys(req.headers)) {
      const value = req.headers[key];
      if (typeof value === "string") {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value[0];
      }
    }

    // Process the webhook
    const result = eventSubService.handleWebhook(headers, rawBody);

    // Send response
    if (typeof result.response === "string") {
      // Challenge response must be plain text
      res.type("text/plain").status(result.statusCode).send(result.response);
    } else {
      res.status(result.statusCode).json(result.response);
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /webhook/twitch
 * Health check for webhook endpoint
 */
router.get("/twitch", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "Twitch EventSub webhook endpoint",
    timestamp: new Date().toISOString(),
  });
});

// Export event handlers for application use
export const onRedemption = (
  callback: (event: RedemptionEvent) => void,
): void => {
  eventSubService.on("redemption", callback);
};

export const onRevocation = (
  callback: (subscription: unknown) => void,
): void => {
  eventSubService.on("revocation", callback);
};

export default router;
