# XiaoIce Webhook Integration - Implementation Summary

## Overview

This implementation integrates XiaoIce platform with OpenClaw Gateway through a webhook proxy server that handles HTTP requests and forwards them to the OpenClaw CLI.

## Architecture

```
XiaoIce Platform → Webhook Proxy (Port 3002) → OpenClaw CLI → OpenClaw Gateway (Port 18789)
```

## Files

- **webhook-proxy.js** - Main webhook server with authentication and streaming support
- **test-webhook.sh** - Comprehensive test suite
- **openclaw.json** - OpenClaw configuration (already configured)

## Features Implemented

### ✅ Security Features

1. **SHA512 Signature Verification**
   - Algorithm: `SHA512Hash(RequestBody+SecretKey+TimeStamp)`
   - Timing-safe comparison using `crypto.timingSafeEqual()`
   - Prevents timing attacks

2. **Replay Attack Protection**
   - 5-minute timestamp window validation
   - Rejects requests with old/future timestamps

3. **Request Size Limiting**
   - 10MB maximum body size
   - Prevents memory exhaustion attacks

4. **Generic Error Messages**
   - No information leakage in error responses
   - All auth failures return generic "Unauthorized"

5. **Optional Authentication Mode** (NEW)
   - Authentication enabled by default (secure by default)
   - Can be disabled for development/testing via `XIAOICE_AUTH_REQUIRED=false`
   - Visual warnings when authentication is disabled
   - Interactive confirmation required when starting with auth disabled

### ✅ Streaming Support

1. **Server-Sent Events (SSE)**
   - Proper SSE headers: `text/event-stream`, `no-cache`, `keep-alive`
   - Chunk format: `event: message\ndata: {json}\n\n`
   - Final response is marked inside JSON with `isFinal: true`

2. **Non-Streaming Mode**
   - Backward compatible with traditional request/response
   - Automatic detection via `Accept` header

### ✅ Timeout Control

1. **18-Second Timeout**
   - Enforced on all OpenClaw CLI calls
   - Graceful process termination with SIGTERM
   - Proper cleanup of event listeners

2. **Timeout Error Handling**
   - Returns user-friendly error messages
   - Maintains XiaoIce response format

### ✅ XiaoIce Format Compliance

**Request Format:**
```json
{
  "askText": "用户输入文本",
  "sessionId": "会话ID",
  "traceId": "请求追踪ID",
  "languageCode": "zh",
  "extra": {}
}
```

**Response Format:**
```json
{
  "id": "xiaoice-1234567890-abc123",
  "traceId": "trace-001",
  "sessionId": "session-001",
  "askText": "用户输入文本",
  "replyText": "AI回复内容",
  "replyType": "Llm",
  "timestamp": 1709366400000,
  "replyPayload": {},
  "extra": {
    "modelName": "openclaw"
  },
  "isFinal": true
}
```

## Configuration

### Environment Variables

```bash
# Authentication Control (NEW)
export XIAOICE_AUTH_REQUIRED="true"  # Set to "false" to disable auth (DEV ONLY)

# Optional - defaults provided for testing
export XIAOICE_ACCESS_KEY="your-access-key"
export XIAOICE_SECRET_KEY="your-secret-key"
export XIAOICE_TIMEOUT="18000"  # milliseconds
export PORT="3002"
```

### Default Test Credentials

- Access Key: `test-key`
- Secret Key: `test-secret`
- Timeout: 18000ms (18 seconds)

## Usage

### 1. Start the Webhook Proxy

```bash
cd /home/yirongbest/.openclaw

# With authentication enabled (default, recommended for production)
node webhook-proxy.js

# With authentication disabled (development/testing only)
export XIAOICE_AUTH_REQUIRED=false
node webhook-proxy.js

# Or use the start script (includes safety checks)
./start-webhook.sh
```

### 2. Expose via Tunnel (for XiaoIce platform)

```bash
# Using localtunnel (already running)
lt --port 3002 --subdomain loose-buses-hide

# Or using ngrok
ngrok http 3002
```

### 3. Configure XiaoIce Platform

**Option A: If XiaoIce supports custom HTTP headers (recommended)**
- Webhook URL: `https://loose-buses-hide.loca.lt/webhooks/xiaoice`
- Configure custom headers:
  - `x-xiaoice-timestamp`: Current timestamp in milliseconds
  - `x-xiaoice-signature`: SHA512(RequestBody + SecretKey + Timestamp)
  - `x-xiaoice-key`: `test-key`

**Option B: If XiaoIce does NOT support custom headers**
- Disable authentication: `export XIAOICE_AUTH_REQUIRED=false`
- Webhook URL: `https://loose-buses-hide.loca.lt/webhooks/xiaoice`
- ⚠️ **WARNING**: Only use this in development/testing environments

### 4. Run Tests

```bash
# Make sure webhook-proxy.js is running first

# Quick test (basic functionality)
./test-quick.sh

# Comprehensive test suite
./test-webhook.sh

# Authentication modes test (new)
./test-auth-modes.sh

# Interactive authentication helper
./xiaoice-auth-helper.sh
```

## Testing

### Test Scenarios Covered

1. ✅ Valid signature with non-streaming response
2. ✅ Invalid signature (401 expected)
3. ✅ Missing authentication headers (401 expected)
4. ✅ Streaming SSE response
5. ✅ Non-streaming response
6. ✅ Health check endpoint
7. ✅ Replay attack protection (401 expected)
8. ✅ **Authentication enabled mode** (new)
9. ✅ **Authentication disabled mode** (new)

### Test Scripts

- **test-quick.sh** - Quick smoke test (3 tests)
- **test-webhook.sh** - Comprehensive test suite (7 tests)
- **test-auth-modes.sh** - Authentication modes test (6 tests)
- **xiaoice-auth-helper.sh** - Interactive authentication helper tool

### Evidence Files

All test results are saved to: `/mnt/c/Users/yuyirong/.sisyphus/evidence/`

- `task-2-valid-signature.txt`
- `task-2-invalid-signature.txt`
- `task-2-missing-headers.txt`
- `task-3-streaming-response.txt`
- `task-3-non-streaming-response.txt`
- `task-health-check.txt`
- `task-replay-attack.txt`
- `task-5-test-summary.txt`

## API Endpoints

### POST /webhooks/xiaoice

Main webhook endpoint for XiaoIce dialogue requests.

**Headers:**
- `Content-Type: application/json`
- `x-xiaoice-timestamp: <unix_timestamp_ms>`
- `x-xiaoice-signature: <sha512_hex>`
- `x-xiaoice-key: <access_key>`
- `Accept: text/event-stream` (optional, for streaming)

**Response:**
- Non-streaming: JSON object
- Streaming: SSE stream with `data:` chunks

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "xiaoice-webhook-proxy",
  "timestamp": 1709366400000
}
```

## Security Considerations

### ✅ Implemented

- Constant-time signature comparison
- Timestamp-based replay protection
- Request size limits
- No information leakage in errors
- Environment variable configuration
- Graceful shutdown (SIGTERM/SIGINT)
- Optional authentication mode with secure defaults

### ⚠️ Production Recommendations

1. **Use HTTPS**: Deploy behind a reverse proxy with TLS
2. **Rate Limiting**: Add rate limiting per IP/session
3. **Monitoring**: Add metrics and alerting
4. **Logging**: Consider structured logging with log levels
5. **Secrets Management**: Use proper secrets management (AWS Secrets Manager, etc.)
6. **Keep Authentication Enabled**: Never disable authentication in production

## Authentication Configuration

### Overview

The webhook proxy supports optional authentication to accommodate different deployment scenarios:

- **Production**: Authentication ENABLED (default) - requires valid signature headers
- **Development/Testing**: Authentication can be DISABLED - accepts requests without headers

### How to Configure

**Enable Authentication (Default - Recommended)**
```bash
# Method 1: Don't set the variable (enabled by default)
node webhook-proxy.js

# Method 2: Explicitly enable
export XIAOICE_AUTH_REQUIRED=true
node webhook-proxy.js
```

**Disable Authentication (Development/Testing Only)**
```bash
# Set environment variable
export XIAOICE_AUTH_REQUIRED=false
node webhook-proxy.js

# Or use start script (includes safety confirmation)
XIAOICE_AUTH_REQUIRED=false ./start-webhook.sh
```

### When to Disable Authentication

✅ **Safe to disable:**
- Local development and testing
- XiaoIce platform doesn't support custom HTTP headers
- Behind a secure API gateway that handles authentication
- Internal network with IP whitelisting

❌ **Never disable in:**
- Production environments exposed to the internet
- Shared development environments
- Any environment handling real user data

### Visual Indicators

When authentication is disabled, the webhook displays prominent warnings:

```
╔═══════════════════════════════════════════════════════════╗
║         XiaoIce Webhook Proxy                           ║
╠═══════════════════════════════════════════════════════════╣
║  Webhook:  http://localhost:3002/webhooks/xiaoice     ║
║  Health:   http://localhost:3002/health               ║
║  Auth:     DISABLED ⚠                                  ║
╠═══════════════════════════════════════════════════════════╣

⚠ WARNING: Authentication is DISABLED
⚠ This should ONLY be used in development/testing
⚠ Set XIAOICE_AUTH_REQUIRED=true for production
```

### Testing Authentication Modes

Use the provided test scripts to verify both authentication modes:

```bash
# Test both enabled and disabled modes
./test-auth-modes.sh

# Interactive authentication helper
./xiaoice-auth-helper.sh
```

The authentication helper provides:
1. Explanation of how authentication works
2. Signature generation examples
3. Test requests with/without authentication
4. Configuration guidance for XiaoIce platform

## Troubleshooting

### Webhook returns 401 Unauthorized

**If authentication is enabled:**
- Check timestamp is current (within 5 minutes)
- Verify signature calculation: `SHA512(body + secretKey + timestamp)`
- Ensure all three headers are present: `x-xiaoice-timestamp`, `x-xiaoice-signature`, `x-xiaoice-key`
- Use `./xiaoice-auth-helper.sh` to test signature generation

**If XiaoIce platform doesn't support custom headers:**
- Disable authentication: `export XIAOICE_AUTH_REQUIRED=false`
- Restart webhook: `./start-webhook.sh`
- ⚠️ Only use this in development/testing environments

### Timeout errors

- Default timeout is 18 seconds
- Complex queries may timeout - consider increasing `XIAOICE_TIMEOUT`
- Check OpenClaw Gateway is running on port 18789

### Streaming not working

- Verify `Accept: text/event-stream` header is set
- Check client supports SSE
- Ensure no buffering proxies between client and server

### Tests failing with 502 errors

- Check if you have a proxy configured (http_proxy environment variable)
- The test scripts automatically disable proxy for localhost
- Manually unset proxy: `unset http_proxy https_proxy`

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| SHA512 Signature Verification | ✅ Complete | Timing-safe comparison |
| Replay Attack Protection | ✅ Complete | 5-minute window |
| Request Size Limit | ✅ Complete | 10MB max |
| 18-Second Timeout | ✅ Complete | With cleanup |
| SSE Streaming | ✅ Complete | Full support |
| Non-Streaming | ✅ Complete | Backward compatible |
| Type Safety | ✅ Complete | All fields validated |
| Error Handling | ✅ Complete | No info leakage |
| Environment Config | ✅ Complete | All settings configurable |
| Graceful Shutdown | ✅ Complete | SIGTERM/SIGINT |
| Optional Authentication | ✅ Complete | Secure by default |
| Authentication Helper Tool | ✅ Complete | Interactive guide |
| Authentication Mode Tests | ✅ Complete | 6 test scenarios |

## Next Steps

1. ✅ Implementation complete
2. ✅ Local testing complete
3. ⏳ End-to-end testing with XiaoIce platform
4. ⏳ Production deployment
5. ⏳ Monitoring and metrics

## Contact

For issues or questions, refer to the OpenClaw documentation or XiaoIce platform integration guide.
