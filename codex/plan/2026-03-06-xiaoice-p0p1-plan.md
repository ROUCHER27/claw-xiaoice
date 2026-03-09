# XiaoIce P0/P1 Fix Plan

## Summary

- Align webhook response contract to a single XiaoIce envelope for both streaming and non-streaming.
- Fix auth default mismatch, plugin signature verification weaknesses, and plugin streaming that was not consumed.
- Improve runtime resilience with request limits, timeout settings, SSE heartbeat, and FIFO session queueing.
- Block future secret leakage and provide a rotation checklist.

## Implemented Changes

1. `src/handlers.js`
- Unified response envelope for success, empty input, timeout, and processing errors.
- Non-streaming now returns JSON envelope instead of `text/plain`.
- Streaming always returns SSE envelope plus `[DONE]`.
- Added SSE heartbeat comments.
- Switched session queue policy to FIFO with per-session queue limit.
- Added queue observability logs (`queueLength`, `waitMs`, `processingMs`).
- Added request aborted/error handling and proactive `req.destroy()` on `413` payload too large.

2. `webhook-proxy-new.js` + `src/server.js` + `xiaoice-config.sh`
- Added config for session queue limit and server timeout settings.
- Added config for SSE heartbeat interval.
- Applied request/header timeout configuration in server startup.
- Unified auth default to enabled (`XIAOICE_AUTH_REQUIRED=true` by default in helper script).
- Added `--noproxy "*"` for local ngrok API lookup in helper script.

3. `extensions/xiaoice/src/webhook.ts`
- Switched signature verification to raw body (`req.text()`) before JSON parse.
- Enforced signature header presence when `webhookSecret` is configured.
- Added constant-time signature comparison.
- Added explicit `400` for invalid JSON.

4. `extensions/xiaoice/src/api.ts` + `extensions/xiaoice/src/channel.ts`
- Replaced inert `TransformStream` path with active stream consumption using `ReadableStream.getReader()`.
- Added robust SSE block parsing across chunk boundaries.
- Ensured `onChunk` is awaited and invoked.
- Ensured writer gets final `[DONE]` and close in plugin streaming path.

5. Secret hygiene
- Added `openclaw.json` to `.gitignore` to prevent future accidental commits.
- Added `openclaw.example.json` template for shared configuration without secrets.
- Added `docs/security/secret-rotation-checklist.md` for immediate credential rotation workflow.

## Validation Plan

- Run unit tests (`npm test`) for handler behavior and queue order.
- Verify non-streaming response body is envelope JSON.
- Verify streaming response contains one envelope event and `[DONE]`.
- Verify queue order is FIFO for same session.
- Verify plugin webhook rejects missing/invalid signatures when secret is set.

## Follow-up

- Rotate any credentials currently present in local `openclaw.json` and related config stores.
- Confirm XiaoIce console displays replies for the traced session after deployment.
