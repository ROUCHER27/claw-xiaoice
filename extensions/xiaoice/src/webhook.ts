import type { OpenClawRuntime } from "openclaw/plugin-sdk";
import crypto from "crypto";
import type { WebhookPayload } from "./types.js";
import { resolveXiaoiceAccount } from "./accounts.js";

function timingSafeEqualHex(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(normalizedLeft, "utf8"),
    Buffer.from(normalizedRight, "utf8"),
  );
}

export function createWebhookHandler(runtime: OpenClawRuntime) {
  return async function handleXiaoiceWebhook(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/").filter(Boolean);
      const accountId = pathParts[pathParts.length - 1];
      const rawBody = await req.text();
      const account = resolveXiaoiceAccount({
        cfg: runtime.config,
        accountId,
      });

      if (account.config.webhookSecret) {
        const signature = req.headers.get("x-signature") || req.headers.get("X-Signature");
        if (!signature) {
          runtime.logger?.warn?.(`Missing signature header for account ${accountId}`);
          return new Response("Missing signature", { status: 401 });
        }

        const expectedSig = crypto
          .createHmac("sha256", account.config.webhookSecret)
          .update(rawBody)
          .digest("hex");

        if (!timingSafeEqualHex(signature, expectedSig)) {
          runtime.logger?.warn?.(`Invalid signature for account ${accountId}`);
          return new Response("Invalid signature", { status: 401 });
        }
      }

      let body: WebhookPayload;
      try {
        body = JSON.parse(rawBody) as WebhookPayload;
      } catch (error) {
        runtime.logger?.warn?.(`Invalid webhook JSON for account ${accountId}`);
        return new Response("Invalid JSON", { status: 400 });
      }

      const { messageId, userId, text } = body;
      runtime.logger?.info(`Received message from ${userId}: ${text}`);

      return new Response(JSON.stringify({
        ok: true,
        messageId,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      runtime.logger?.error(`Webhook error: ${error}`);
      return new Response("Internal error", { status: 500 });
    }
  };
}
