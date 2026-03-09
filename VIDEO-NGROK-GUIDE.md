# Video Service Ngrok Callback Guide

Complete user documentation for setting up and managing ngrok tunnels for the video service callback system.

## Overview

This guide explains how to configure the video service to receive callbacks from XiaoIce video provider using ngrok tunnels. When XiaoIce completes video generation, it needs to notify your local service via a publicly accessible URL. Ngrok creates secure tunnels that expose your local service to the internet.

## Architecture

### System Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    XiaoIce Video Server                     │
│                  (aibeings-vip.xiaoice.com)                 │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS POST (callback)
                         │ Video generation complete
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              Ngrok Public Tunnel (HTTPS)                    │
│           https://abc123.ngrok-free.app                     │
└────────────────────────┬────────────────────────────────────┘
                         │ Forward to localhost
                         ↓
┌─────────────────────────────────────────────────────────────┐
│         Video Task Service (localhost:3105)                 │
│  - Receives callback with video URL                         │
│  - Updates task status in database                          │
└────────────────────────┬────────────────────────────────────┘
                         │ Store task data
                         ↓
┌─────────────────────────────────────────────────────────────┐
│           SQLite Database (video_tasks.db)                  │
└────────────────────────┬────────────────────────────────────┘
                         │ Query status
                         ↑
┌─────────────────────────────────────────────────────────────┐
│      OpenClaw Video Orchestrator Plugin                    │
│  - Creates video tasks                                      │
│  - Queries task status                                      │
└─────────────────────────────────────────────────────────────┘
```

### Dual Tunnel Architecture

The system uses a single ngrok process to manage two tunnels simultaneously:

```
┌──────────────────────────────────────────────────────────┐
│                    Ngrok Process                         │
│                  (Web UI: localhost:4040)                │
│                                                          │
│  Tunnel 1: xiaoice-webhook                               │
│  - Local:  localhost:3002                                │
│  - Public: https://xyz789.ngrok-free.app                 │
│  - Purpose: XiaoIce chat webhook proxy                   │
│                                                          │
│  Tunnel 2: video-callback                                │
│  - Local:  localhost:3105                                │
│  - Public: https://abc123.ngrok-free.app                 │
│  - Purpose: Video service callbacks                      │
└──────────────────────────────────────────────────────────┘
```

Benefits of dual tunnel approach:
- Single ngrok process, shared resources
- Unified management through one web UI (port 4040)
- Consistent configuration in ngrok.yml
- Both services accessible simultaneously

## Quick Start

### Prerequisites

Before starting, ensure you have:

1. **Ngrok installed**
   ```bash
   # Check if ngrok is installed
   which ngrok

   # If not installed, download and install
   wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
   tar xvzf ngrok-v3-stable-linux-amd64.tgz -C ~/bin/
   ```

2. **Ngrok authtoken configured**
   ```bash
   # Configure your authtoken (get it from https://dashboard.ngrok.com)
   ngrok config add-authtoken YOUR_NGROK_TOKEN
   ```

3. **Environment variables set**
   - Copy `.env.example` to `.env`
   - Set strong random tokens for VIDEO_SERVICE_ADMIN_TOKEN and VIDEO_SERVICE_CALLBACK_TOKEN

### Option 1: Automatic Configuration (Recommended)

This is the easiest way to get started. The system handles everything automatically.

1. Enable ngrok in your `.env` file:
   ```bash
   VIDEO_USE_NGROK=true
   ```

2. Start the video service:
   ```bash
   ./start-video-service.sh
   ```

The script will automatically:
- Check if ngrok is running, start it if needed
- Wait for tunnels to establish (2 seconds)
- Update the callback URL via admin API
- Verify the configuration

You should see output like:
```
VIDEO_USE_NGROK enabled, checking ngrok status...
Starting ngrok...
✓ 小冰 Webhook 隧道建立成功！
✓ 视频回调隧道建立成功！
Starting video task service on port 3105...
Updating video callback URL...
✓ 配置更新成功！
```

### Option 2: Manual Configuration

For more control over the process, configure each component manually.

1. Configure ngrok tunnels in `~/.ngrok2/ngrok.yml` (see Configuration section below)

2. Start ngrok:
   ```bash
   ./start-ngrok.sh
   ```

3. Start the video service:
   ```bash
   ./start-video-service.sh
   ```

4. Update the callback URL:
   ```bash
   ./update-video-callback.sh
   ```

5. Verify everything is working:
   ```bash
   ./video-ngrok-status.sh
   ```

## Usage

### Starting Services

**Start video service with automatic ngrok setup**:
```bash
VIDEO_USE_NGROK=true ./start-video-service.sh
```

Or set it permanently in `.env`:
```bash
echo "VIDEO_USE_NGROK=true" >> .env
./start-video-service.sh
```

**Start video service without ngrok**:
```bash
./start-video-service.sh
```

**Start ngrok separately**:
```bash
./start-ngrok.sh
```

**Stop ngrok**:
```bash
pkill ngrok
```

Or use the stop script:
```bash
./stop-ngrok.sh
```

### Checking Status

**Check video callback tunnel status**:
```bash
./video-ngrok-status.sh
```

Expected output:
```
════════════════════════════════════════
   视频服务 Ngrok 隧道状态
════════════════════════════════════════

✓ Ngrok 进程运行中

视频回调隧道信息:
  公网 URL:    https://abc123.ngrok-free.app
  回调端点:    https://abc123.ngrok-free.app/v1/callbacks/provider?token=your-token

连接统计:
  总连接数:    5

小冰 Webhook 隧道:
  公网 URL:    https://xyz789.ngrok-free.app

管理工具:
  Web 界面:    http://localhost:4040
  更新配置:    ./update-video-callback.sh
```

**Check video service health**:
```bash
curl http://127.0.0.1:3105/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "video-task-service",
  "timestamp": 1234567890
}
```

**Check ngrok web UI**:

Open in your browser:
```
http://localhost:4040
```

The web UI shows:
- All active tunnels with their public URLs
- Real-time request/response inspection
- Connection statistics and metrics
- Tunnel configuration details

### Updating Callback URL

After ngrok restarts or when the public URL changes:

```bash
./update-video-callback.sh
```

The script performs these steps:
1. Checks if video service is running on port 3105
2. Retrieves public URL from cache file (`/home/yirongbest/.openclaw/.video-ngrok-url`)
3. If cache is empty, queries ngrok API at `http://localhost:4040/api/tunnels`
4. Calls video service admin API: `PUT /v1/admin/config`
5. Updates `callbackPublicBaseUrl` field
6. Displays the updated configuration

Expected output:
```
════════════════════════════════════════
   更新视频服务回调 URL
════════════════════════════════════════

✓ 视频服务运行中

从缓存读取 URL: https://abc123.ngrok-free.app

准备更新配置...
  公网 URL:    https://abc123.ngrok-free.app
  API 端点:    http://127.0.0.1:3105/v1/admin/config

✓ 配置更新成功！

当前配置:
  回调基础 URL: https://abc123.ngrok-free.app

完整回调端点:
  https://abc123.ngrok-free.app/v1/callbacks/provider?token=your-token

验证方法:
  curl -X POST "https://abc123.ngrok-free.app/v1/callbacks/provider?token=your-token" \
    -H "Content-Type: application/json" \
    -d '{"providerTaskId":"test","videoUrl":"https://example.com/video.mp4"}'
```

### Verifying Configuration

**Check callback URL in configuration file**:
```bash
cat credentials/video-service.secrets.json | grep callbackPublicBaseUrl
```

**View full configuration**:
```bash
cat credentials/video-service.secrets.json | jq .
```

**Test configuration via admin API**:
```bash
curl -s http://127.0.0.1:3105/v1/admin/config \
  -H "X-Admin-Token: your-admin-token" | jq .
```

## Configuration

### Ngrok Configuration File

The ngrok configuration file defines named tunnels that can be started together. This allows a single ngrok process to expose multiple local services.

**Location**: `~/.ngrok2/ngrok.yml`

**Required configuration**:
```yaml
version: "2"
authtoken: YOUR_NGROK_TOKEN

tunnels:
  xiaoice-webhook:
    proto: http
    addr: 3002
  video-callback:
    proto: http
    addr: 3105
```

**What this does**:
- `xiaoice-webhook`: Exposes port 3002 (XiaoIce webhook proxy) to the internet
- `video-callback`: Exposes port 3105 (video service) to the internet
- Both tunnels share the same ngrok process and web UI (port 4040)

**To start both tunnels**:
```bash
ngrok start xiaoice-webhook video-callback
```

Or use the provided script:
```bash
./start-ngrok.sh
```

The script automatically detects if you have named tunnels configured and uses them, otherwise falls back to single tunnel mode.

### Environment Variables

Add these to your `.env` file (copy from `.env.example` if needed):

```bash
# Video Service Configuration
VIDEO_TASK_SERVICE_PORT=3105
VIDEO_SERVICE_INTERNAL_TOKEN=REPLACE_WITH_INTERNAL_TOKEN
VIDEO_SERVICE_ADMIN_TOKEN=REPLACE_WITH_ADMIN_TOKEN
VIDEO_SERVICE_CALLBACK_TOKEN=REPLACE_WITH_CALLBACK_TOKEN

# Video Provider Configuration
VIDEO_PROVIDER_API_BASE_URL=http://aibeings-vip.xiaoice.com
VIDEO_PROVIDER_API_KEY=REPLACE_WITH_PROVIDER_API_KEY
VIDEO_PROVIDER_MODEL_ID=CVHPZJ4LCGBMNIZULS0
VIDEO_PROVIDER_VH_BIZ_ID=REPLACE_WITH_VH_BIZ_ID

# Ngrok Integration
VIDEO_USE_NGROK=false  # Set to 'true' to enable automatic ngrok setup
```

**Token descriptions**:

1. **VIDEO_SERVICE_INTERNAL_TOKEN**: Authenticates OpenClaw plugin → video service API calls
   - Used for creating tasks and querying status
   - Passed as `X-Internal-Token` header

2. **VIDEO_SERVICE_ADMIN_TOKEN**: Authenticates configuration management API calls
   - Used by `update-video-callback.sh` script
   - Passed as `X-Admin-Token` header

3. **VIDEO_SERVICE_CALLBACK_TOKEN**: Authenticates XiaoIce provider → video service callbacks
   - Used when XiaoIce sends completion notifications
   - Can be passed as query parameter `?token=xxx` or header `X-Callback-Token`

**Generate secure tokens**:
```bash
# Generate a strong random token
openssl rand -hex 32
```

### Manual Configuration Steps

If you prefer step-by-step manual control:

**Step 1: Configure ngrok.yml**
```bash
# Edit the ngrok configuration file
nano ~/.ngrok2/ngrok.yml

# Add the tunnels configuration shown above
```

**Step 2: Start ngrok**
```bash
cd /home/yirongbest/claw-xiaoice
./start-ngrok.sh
```

Expected output:
```
════════════════════════════════════════
       启动 Ngrok 隧道
════════════════════════════════════════

使用多隧道配置 (xiaoice-webhook + video-callback)
✓ Ngrok 已启动 (PID: 12345)

等待隧道建立...
✓ 小冰 Webhook 隧道建立成功！

公网 URL: https://xyz789.ngrok-free.app
Webhook:  https://xyz789.ngrok-free.app/webhooks/xiaoice

✓ 视频回调隧道建立成功！

公网 URL: https://abc123.ngrok-free.app
回调端点: https://abc123.ngrok-free.app/v1/callbacks/provider
```

**Step 3: Verify tunnels**
```bash
./video-ngrok-status.sh
```

**Step 4: Start video service**
```bash
./start-video-service.sh
```

**Step 5: Update callback URL**
```bash
./update-video-callback.sh
```

**Step 6: Verify configuration**
```bash
# Check the configuration file
cat credentials/video-service.secrets.json | grep callbackPublicBaseUrl
```

Should show:
```json
"callbackPublicBaseUrl": "https://abc123.ngrok-free.app"
```

### Automatic Configuration with VIDEO_USE_NGROK

When `VIDEO_USE_NGROK=true`, the `start-video-service.sh` script performs these steps automatically:

1. Checks if ngrok is running
2. Starts ngrok if needed (calls `start-ngrok.sh`)
3. Waits 2 seconds for tunnels to establish
4. Starts the video service
5. Calls `update-video-callback.sh` to update the configuration
6. Reports success or failure

This is ideal for development where you want everything to "just work".

## Verification

### Test Callback Endpoint

**Step 1: Get the public URL**
```bash
PUBLIC_URL=$(cat /home/yirongbest/.openclaw/.video-ngrok-url)
echo "Public URL: $PUBLIC_URL"
```

**Step 2: Get your callback token**
```bash
# From .env file
source .env
echo "Callback Token: $VIDEO_SERVICE_CALLBACK_TOKEN"
```

**Step 3: Test the callback endpoint**
```bash
curl -X POST "${PUBLIC_URL}/v1/callbacks/provider?token=${VIDEO_SERVICE_CALLBACK_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"providerTaskId":"test-123","videoUrl":"https://example.com/video.mp4"}'
```

Expected response:
```json
{"data":{"acknowledged":true}}
```

If you get this response, your callback endpoint is working correctly and accessible from the internet.

**Alternative: Test with HTTP header authentication**
```bash
curl -X POST "${PUBLIC_URL}/v1/callbacks/provider" \
  -H "Content-Type: application/json" \
  -H "X-Callback-Token: ${VIDEO_SERVICE_CALLBACK_TOKEN}" \
  -d '{"providerTaskId":"test-123","videoUrl":"https://example.com/video.mp4"}'
```

### Verify Ngrok Tunnels

**Method 1: Use the status script**
```bash
./video-ngrok-status.sh
```

**Method 2: Query ngrok API directly**
```bash
curl -s http://localhost:4040/api/tunnels | jq '.tunnels[] | {name: .name, public_url: .public_url, addr: .config.addr}'
```

Expected output:
```json
{
  "name": "xiaoice-webhook",
  "public_url": "https://xyz789.ngrok-free.app",
  "addr": "http://localhost:3002"
}
{
  "name": "video-callback",
  "public_url": "https://abc123.ngrok-free.app",
  "addr": "http://localhost:3105"
}
```

**Method 3: Access ngrok web UI**

Open in browser: `http://localhost:4040`

Navigate to:
- **Status** tab: View all active tunnels
- **Inspect** tab: See request/response history
- **Replay** tab: Replay previous requests for testing

### End-to-End Testing with Actual Video Task

This tests the complete workflow from task creation to callback reception.

**Step 1: Create a video task through OpenClaw**

Use the OpenClaw chat interface or API to create a video task with the `xiaoice_video_produce` tool.

**Step 2: Monitor video service logs**
```bash
tail -f video-service.log
```

Look for:
- Task creation: `Created task: vtask-xxx`
- Provider submission: `Submitting to provider with callback URL`
- Callback URL in logs: Should show your ngrok URL

**Step 3: Monitor ngrok requests**

Open `http://localhost:4040/inspect/http` in your browser.

You'll see:
- The initial task creation request (if using ngrok for that)
- The callback request from XiaoIce when video is ready

**Step 4: Wait for video generation**

XiaoIce typically takes 5-10 minutes to generate a video. Be patient.

**Step 5: Check for callback in ngrok UI**

When the video is ready, you should see a POST request to `/v1/callbacks/provider` in the ngrok web UI.

**Step 6: Verify callback was processed**
```bash
# Check logs for callback processing
grep "Callback received" video-service.log

# Or check for the specific task ID
grep "vtask-xxx" video-service.log
```

**Step 7: Query task status**

Through OpenClaw or directly:
```bash
TASK_ID="vtask-xxx"  # Replace with your actual task ID
curl -s http://127.0.0.1:3105/v1/tasks/${TASK_ID} \
  -H "X-Internal-Token: ${VIDEO_SERVICE_INTERNAL_TOKEN}" | jq .
```

Expected response for completed task:
```json
{
  "data": {
    "taskId": "vtask-xxx",
    "status": "succeeded",
    "videoUrl": "https://xiaoice-cdn.example.com/video.mp4",
    "providerTaskId": "provider-task-123",
    "createdAt": 1234567890,
    "updatedAt": 1234567900
  }
}
```

### Verification Checklist

Use this checklist to ensure everything is configured correctly:

- [ ] Ngrok is installed and authtoken is configured
- [ ] `~/.ngrok2/ngrok.yml` contains both tunnel definitions
- [ ] Ngrok is running (check with `pgrep ngrok`)
- [ ] Both tunnels are active (check with `./video-ngrok-status.sh`)
- [ ] Video service is running on port 3105
- [ ] Callback URL is updated in configuration file
- [ ] Test callback endpoint returns `{"data":{"acknowledged":true}}`
- [ ] Ngrok web UI is accessible at `http://localhost:4040`
- [ ] Environment variables are set in `.env` file
- [ ] All three tokens are configured with strong random values

## Troubleshooting

### Ngrok Not Starting

**Symptoms**:
- `video-ngrok-status.sh` shows "❌ Ngrok 未运行"
- `start-ngrok.sh` fails to start ngrok

**Solutions**:

1. Check if ngrok is installed:
```bash
which ngrok
```

If not found, install it:
```bash
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar xvzf ngrok-v3-stable-linux-amd64.tgz -C ~/bin/
```

2. Verify authtoken is configured:
```bash
cat ~/.ngrok2/ngrok.yml | grep authtoken
```

If missing, add it:
```bash
ngrok config add-authtoken YOUR_TOKEN
```

3. Check ngrok logs for errors:
```bash
tail -20 /home/yirongbest/.openclaw/ngrok.log
```

4. Try starting ngrok manually:
```bash
ngrok start xiaoice-webhook video-callback
```

5. Check for port conflicts (ngrok web UI uses port 4040):
```bash
lsof -i :4040
```

If port 4040 is in use, kill the process:
```bash
pkill ngrok
./start-ngrok.sh
```

### Callback URL Not Updating

**Symptoms**:
- Configuration file still shows `http://127.0.0.1:3105`
- `update-video-callback.sh` fails

**Solutions**:

1. Verify ngrok is running:
```bash
./video-ngrok-status.sh
```

2. Check if video service is running:
```bash
curl http://127.0.0.1:3105/health
```

If not running:
```bash
./start-video-service.sh
```

3. Verify admin token is correct:
```bash
# Check token in .env
grep VIDEO_SERVICE_ADMIN_TOKEN .env

# Test with correct token
export VIDEO_SERVICE_ADMIN_TOKEN=your-correct-token
./update-video-callback.sh
```

4. Manually update via API:
```bash
PUBLIC_URL=$(cat /home/yirongbest/.openclaw/.video-ngrok-url)
curl -X PUT http://127.0.0.1:3105/v1/admin/config \
  -H "X-Admin-Token: your-admin-token" \
  -H "Content-Type: application/json" \
  -d "{\"callbackPublicBaseUrl\": \"${PUBLIC_URL}\"}"
```

5. Check if cache file exists:
```bash
ls -la /home/yirongbest/.openclaw/.video-ngrok-url
cat /home/yirongbest/.openclaw/.video-ngrok-url
```

If missing, ngrok might not have saved it. Restart ngrok:
```bash
pkill ngrok
./start-ngrok.sh
```

### XiaoIce Callback Failures

**Symptoms**:
- Video generation completes but task status doesn't update
- Task remains in "pending" or "processing" state
- No callback requests visible in ngrok web UI

**Diagnostic Steps**:

1. Check ngrok status:
```bash
./video-ngrok-status.sh
```

2. Verify callback URL in configuration:
```bash
cat credentials/video-service.secrets.json | grep callbackPublicBaseUrl
```

Should show ngrok URL, not localhost.

3. Check ngrok web UI for incoming requests:
```
http://localhost:4040/inspect/http
```

Look for POST requests to `/v1/callbacks/provider`.

4. Review video service logs:
```bash
tail -f video-service.log | grep -i callback
```

Look for:
- "Callback received" messages
- Error messages about authentication
- Parsing errors

5. Test callback endpoint publicly:
```bash
PUBLIC_URL=$(cat /home/yirongbest/.openclaw/.video-ngrok-url)
curl -X POST "${PUBLIC_URL}/v1/callbacks/provider?token=${VIDEO_SERVICE_CALLBACK_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"providerTaskId":"test","videoUrl":"https://example.com/test.mp4"}'
```

6. Check if callback token matches:
```bash
# Token in .env
grep VIDEO_SERVICE_CALLBACK_TOKEN .env

# Token in callback URL (from logs or config)
grep callbackPublicBaseUrl credentials/video-service.secrets.json
```

**Common Issues**:

- **Wrong callback token**: Returns 401 Unauthorized
  - Solution: Update token in `.env` and restart video service

- **Ngrok tunnel expired**: Free ngrok tunnels expire after 2 hours of inactivity
  - Solution: Restart ngrok and update callback URL

- **Firewall blocking ngrok**: Some networks block ngrok domains
  - Solution: Check network settings, try different network

- **Invalid callback URL format**: Missing protocol or malformed URL
  - Solution: Ensure URL starts with `https://` and has no trailing slash

### Authentication Errors (401)

**Symptoms**:
- `update-video-callback.sh` returns "❌ 认证失败 (401)"
- API calls return `{"error":"Unauthorized"}`

**Solutions**:

1. Verify admin token in `.env`:
```bash
grep VIDEO_SERVICE_ADMIN_TOKEN .env
```

2. Check if `.env` is loaded:
```bash
source .env
echo $VIDEO_SERVICE_ADMIN_TOKEN
```

3. Test with explicit token:
```bash
curl -X PUT http://127.0.0.1:3105/v1/admin/config \
  -H "X-Admin-Token: your-actual-token-here" \
  -H "Content-Type: application/json" \
  -d '{"callbackPublicBaseUrl": "https://test.ngrok-free.app"}'
```

4. Restart video service to reload environment:
```bash
pkill -f "node services/video-task-service"
./start-video-service.sh
```

### Tunnel Not Found

**Symptoms**:
- `video-ngrok-status.sh` shows "⚠ 未找到 video-callback 隧道"
- Only one tunnel appears in ngrok web UI

**Solutions**:

1. Verify `~/.ngrok2/ngrok.yml` contains tunnel configuration:
```bash
cat ~/.ngrok2/ngrok.yml
```

Should include:
```yaml
tunnels:
  video-callback:
    proto: http
    addr: 3105
```

2. Check tunnel names in ngrok:
```bash
curl -s http://localhost:4040/api/tunnels | grep -o '"name":"[^"]*"'
```

Expected output:
```
"name":"xiaoice-webhook"
"name":"video-callback"
```

3. Restart ngrok with correct configuration:
```bash
pkill ngrok
./start-ngrok.sh
```

4. Verify start command includes both tunnels:
```bash
# Check ngrok process command
ps aux | grep ngrok
```

Should show: `ngrok start xiaoice-webhook video-callback`

### Port Conflicts

**Symptoms**:
- Video service fails to start
- Error: "Port 3105 already in use"
- Ngrok web UI not accessible

**Solutions**:

1. Check what's using port 3105:
```bash
lsof -i :3105
```

2. Kill existing video service:
```bash
pkill -f "node services/video-task-service"
```

Or use PID file:
```bash
if [ -f video-service.pid ]; then
  kill $(cat video-service.pid)
fi
```

3. Check ngrok web UI port (4040):
```bash
lsof -i :4040
```

4. Kill all ngrok processes:
```bash
pkill ngrok
```

5. Restart services:
```bash
./start-ngrok.sh
./start-video-service.sh
```

### Connection Timeout

**Symptoms**:
- `update-video-callback.sh` shows "❌ 连接失败"
- Curl commands timeout
- Cannot reach ngrok API

**Solutions**:

1. Check if services are actually running:
```bash
# Video service
curl --max-time 2 http://127.0.0.1:3105/health

# Ngrok API
curl --max-time 2 http://localhost:4040/api/tunnels
```

2. Check proxy settings (important for WSL/Linux):
```bash
echo $http_proxy
echo $no_proxy
```

Ensure localhost is bypassed:
```bash
export NO_PROXY=localhost,127.0.0.1
export no_proxy=localhost,127.0.0.1
```

Add to `.env`:
```bash
no_proxy=localhost,127.0.0.1,::1,*.local
NO_PROXY=localhost,127.0.0.1,::1,*.local
```

3. Restart services with proxy bypass:
```bash
NO_PROXY=localhost,127.0.0.1 ./start-video-service.sh
```

### Logs Show Errors

**Check video service logs**:
```bash
tail -50 video-service.log
```

**Check ngrok logs**:
```bash
tail -50 /home/yirongbest/.openclaw/ngrok.log
```

**Common log errors**:

- "ECONNREFUSED": Service not running or wrong port
- "Invalid token": Authentication failure
- "Tunnel not found": Ngrok configuration issue
- "PAYLOAD_TOO_LARGE": Callback payload exceeds limit (unlikely)
- "INVALID_JSON": Malformed callback data from provider

## Security

### Token Authentication

The video service uses three independent tokens for different security contexts:

**1. VIDEO_SERVICE_INTERNAL_TOKEN**
- **Purpose**: Authenticates OpenClaw plugin → video service API calls
- **Used for**: Creating tasks, querying status
- **Header**: `X-Internal-Token: <token>`
- **Endpoints protected**:
  - `POST /v1/tasks/create`
  - `GET /v1/tasks/:id`

**2. VIDEO_SERVICE_ADMIN_TOKEN**
- **Purpose**: Authenticates configuration management operations
- **Used for**: Updating service configuration (like callback URL)
- **Header**: `X-Admin-Token: <token>`
- **Endpoints protected**:
  - `PUT /v1/admin/config`
  - `GET /v1/admin/config`

**3. VIDEO_SERVICE_CALLBACK_TOKEN**
- **Purpose**: Authenticates XiaoIce provider → video service callbacks
- **Used for**: Receiving video completion notifications
- **Methods**: Query parameter `?token=<token>` OR header `X-Callback-Token: <token>`
- **Endpoints protected**:
  - `POST /v1/callbacks/provider`

### Best Practices

**Generate Strong Random Tokens**:
```bash
# Generate a 256-bit random token (64 hex characters)
openssl rand -hex 32

# Generate three tokens at once
echo "INTERNAL_TOKEN=$(openssl rand -hex 32)"
echo "ADMIN_TOKEN=$(openssl rand -hex 32)"
echo "CALLBACK_TOKEN=$(openssl rand -hex 32)"
```

Copy these to your `.env` file:
```bash
VIDEO_SERVICE_INTERNAL_TOKEN=<generated-token-1>
VIDEO_SERVICE_ADMIN_TOKEN=<generated-token-2>
VIDEO_SERVICE_CALLBACK_TOKEN=<generated-token-3>
```

**Never Use Default Values**:
- Default tokens like "video-internal-token" are insecure
- Always replace with strong random values
- Rotate tokens periodically (every 90 days recommended)

**Keep Tokens Secret**:
- Never commit `.env` file to git (already in `.gitignore`)
- Never share tokens in chat, email, or documentation
- Use environment variables, not hardcoded values
- Store securely in password manager if needed

**Callback Authentication Methods**:

Method 1 - Query parameter (recommended for XiaoIce):
```bash
curl "${PUBLIC_URL}/v1/callbacks/provider?token=your-token"
```

Method 2 - HTTP header:
```bash
curl "${PUBLIC_URL}/v1/callbacks/provider" \
  -H "X-Callback-Token: your-token"
```

Both methods are equally secure when using HTTPS (ngrok provides HTTPS by default).

### What Not to Commit to Git

**Never commit these files**:
- `.env` - Contains actual tokens and secrets
- `credentials/video-service.secrets.json` - Contains API keys and runtime config
- `.openclaw/.ngrok-url` - Temporary cache file
- `.openclaw/.video-ngrok-url` - Temporary cache file
- `video-service.log` - May contain sensitive data
- `*.pid` - Process ID files

**Safe to commit**:
- `.env.example` - Template with placeholder values only
- Configuration scripts (`*.sh`)
- Documentation files (`*.md`)
- Source code without hardcoded secrets

**Verify your .gitignore**:
```bash
cat .gitignore | grep -E '\.env$|credentials|\.log|\.pid|ngrok-url'
```

Should include:
```
.env
credentials/
*.log
*.pid
.openclaw/.ngrok-url
.openclaw/.video-ngrok-url
```

### Ngrok Security Considerations

**Public Exposure**:
- Ngrok tunnels are publicly accessible by anyone with the URL
- URLs are randomly generated and hard to guess
- Still, always use token authentication on all endpoints
- Monitor ngrok web UI for suspicious requests

**Free Tier Limitations**:
- URLs change every time ngrok restarts
- No IP whitelisting on free tier
- Limited to 40 connections/minute
- Consider paid plan for production use

**Monitoring**:
```bash
# Check ngrok web UI for request history
open http://localhost:4040/inspect/http

# Look for suspicious patterns:
# - Multiple failed authentication attempts
# - Requests from unexpected IPs
# - Unusual request patterns
```

**Disable Ngrok in Production**:

For production deployments, use proper infrastructure:
```bash
# In production .env
VIDEO_USE_NGROK=false
VIDEO_CALLBACK_PUBLIC_BASE_URL=https://your-domain.com
```

Use ngrok only for:
- Local development and testing
- Receiving callbacks from external services during development
- Temporary demos and prototypes

**Ngrok Paid Features for Production**:
- Reserved domains (stable URLs)
- IP whitelisting
- Custom domains
- Higher rate limits
- Better uptime guarantees

### Environment Variable Security

**Load environment variables securely**:
```bash
# In scripts
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
```

**Check for leaked secrets**:
```bash
# Search for potential secrets in git history
git log -p | grep -i "token\|secret\|password\|key"

# Check current files
grep -r "VIDEO_SERVICE.*TOKEN" . --exclude-dir=node_modules --exclude=.env.example
```

**Rotate tokens if compromised**:
1. Generate new tokens
2. Update `.env` file
3. Restart video service
4. Update callback URL if callback token changed
5. Verify all integrations still work

### Network Security

**Proxy Configuration**:

Ensure localhost traffic bypasses proxy:
```bash
# In .env
no_proxy=localhost,127.0.0.1,::1,*.local
NO_PROXY=localhost,127.0.0.1,::1,*.local
```

This prevents:
- Localhost requests going through external proxy
- Potential token leakage to proxy servers
- Connection timeouts and failures

**Firewall Rules**:

If using firewall, allow:
- Outbound HTTPS to ngrok servers (for tunnel)
- Inbound on localhost:3105 (video service)
- Inbound on localhost:4040 (ngrok web UI)

Block:
- Direct external access to port 3105
- Direct external access to port 4040

## Architecture Overview

### Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    XiaoIce Video Server                     │
│                  (aibeings-vip.xiaoice.com)                 │
│                                                             │
│  - Receives video generation requests                       │
│  - Processes video (5-10 minutes)                           │
│  - Sends callback when complete                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTPS POST (callback)
                         │ Payload: {providerTaskId, videoUrl, status}
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              Ngrok Public Tunnel (HTTPS)                    │
│           https://abc123.ngrok-free.app                     │
│                                                             │
│  - Provides public HTTPS endpoint                           │
│  - Forwards to localhost:3105                               │
│  - Web UI at localhost:4040                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Forward to local service
                         │ Add X-Forwarded-* headers
                         ↓
┌─────────────────────────────────────────────────────────────┐
│         Video Task Service (localhost:3105)                 │
│                                                             │
│  Endpoints:                                                 │
│  - POST /v1/tasks/create (create video task)               │
│  - GET  /v1/tasks/:id (query task status)                  │
│  - POST /v1/callbacks/provider (receive callbacks) ←       │
│  - PUT  /v1/admin/config (update configuration)            │
│  - GET  /health (health check)                             │
│                                                             │
│  Authentication:                                            │
│  - Internal token for task APIs                             │
│  - Admin token for config API                               │
│  - Callback token for provider callbacks                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Store/retrieve task data
                         │ SQL queries
                         ↓
┌─────────────────────────────────────────────────────────────┐
│           SQLite Database (video_tasks.db)                  │
│                                                             │
│  Schema:                                                    │
│  - taskId (primary key)                                     │
│  - status (pending/processing/succeeded/failed)             │
│  - videoUrl (result from callback)                          │
│  - providerTaskId (XiaoIce task ID)                         │
│  - createdAt, updatedAt timestamps                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Query status
                         ↑ Create tasks
┌─────────────────────────────────────────────────────────────┐
│      OpenClaw Video Orchestrator Plugin                    │
│                                                             │
│  Tools:                                                     │
│  - xiaoice_video_produce (create video)                    │
│  - xiaoice_video_status (check status)                     │
│                                                             │
│  Calls video service via HTTP with internal token           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Tool invocations
                         ↑ Tool results
┌─────────────────────────────────────────────────────────────┐
│         OpenClaw Gateway (localhost:18789)                  │
│                                                             │
│  Claude AI assistant with video production capabilities     │
│  User interacts via chat interface                          │
└─────────────────────────────────────────────────────────────┘
```

### Callback Flow Sequence

1. **User Request**: User asks Claude to create a video via OpenClaw chat
2. **Tool Invocation**: OpenClaw invokes `xiaoice_video_produce` tool
3. **Task Creation**: Plugin calls `POST /v1/tasks/create` on video service
4. **Provider Submission**: Video service submits to XiaoIce API with callback URL:
   ```
   POST http://aibeings-vip.xiaoice.com/openapi/aivideo/create
   Body: {
     "modelId": "CVHPZJ4LCGBMNIZULS0",
     "vhBizId": "...",
     "callbackUrl": "https://abc123.ngrok-free.app/v1/callbacks/provider?token=xxx",
     ...
   }
   ```
5. **Task Stored**: Video service stores task in database with status "pending"
6. **Response to User**: OpenClaw returns task ID to user
7. **Video Processing**: XiaoIce processes video (5-10 minutes)
8. **Callback Sent**: XiaoIce POSTs to callback URL via ngrok:
   ```
   POST https://abc123.ngrok-free.app/v1/callbacks/provider?token=xxx
   Body: {
     "providerTaskId": "provider-123",
     "videoUrl": "https://cdn.xiaoice.com/video.mp4",
     "status": "SUCC"
   }
   ```
9. **Ngrok Forwards**: Ngrok forwards to `localhost:3105/v1/callbacks/provider`
10. **Callback Processed**: Video service validates token, updates database
11. **Status Updated**: Task status changes to "succeeded", videoUrl saved
12. **User Queries**: User asks for status via `xiaoice_video_status` tool
13. **Result Retrieved**: Plugin queries video service, returns video URL

### Dual Tunnel Management

The system uses a single ngrok process with two named tunnels:

**Tunnel Configuration** (`~/.ngrok2/ngrok.yml`):
```yaml
tunnels:
  xiaoice-webhook:
    proto: http
    addr: 3002
  video-callback:
    proto: http
    addr: 3105
```

**Start Command**:
```bash
ngrok start xiaoice-webhook video-callback
```

**Result**:
- One ngrok process (single PID)
- Two HTTPS tunnels with different URLs
- Shared web UI at localhost:4040
- Both tunnels visible in API: `http://localhost:4040/api/tunnels`

**Benefits**:
- Resource efficient (one process vs two)
- Unified monitoring and management
- Consistent configuration
- Easier troubleshooting

### File Structure

```
/home/yirongbest/claw-xiaoice/
├── services/
│   └── video-task-service/
│       ├── cli.js                    # Service entry point
│       ├── server.js                 # HTTP server and API handlers
│       └── video_tasks.db            # SQLite database (created at runtime)
├── credentials/
│   └── video-service.secrets.json    # Runtime configuration (auto-updated)
├── extensions/
│   └── video-orchestrator/
│       └── index.js                  # OpenClaw plugin
├── start-video-service.sh            # Start video service (with optional ngrok)
├── start-ngrok.sh                    # Start ngrok tunnels
├── video-ngrok-status.sh             # Check tunnel status
├── update-video-callback.sh          # Update callback URL
├── stop-ngrok.sh                     # Stop ngrok
├── .env                              # Environment variables (not in git)
├── .env.example                      # Template for .env
├── video-service.log                 # Service logs (created at runtime)
└── video-service.pid                 # Process ID file (created at runtime)

/home/yirongbest/.openclaw/
├── .ngrok-url                        # XiaoIce webhook URL cache
├── .video-ngrok-url                  # Video callback URL cache
└── ngrok.log                         # Ngrok logs

~/.ngrok2/
└── ngrok.yml                         # Ngrok configuration
```

### Data Flow

**Task Creation Flow**:
```
User → OpenClaw → Plugin → Video Service → XiaoIce API
                              ↓
                         SQLite DB (status: pending)
```

**Callback Flow**:
```
XiaoIce API → Ngrok → Video Service → SQLite DB (status: succeeded)
                                         ↓
                                    videoUrl stored
```

**Status Query Flow**:
```
User → OpenClaw → Plugin → Video Service → SQLite DB
                              ↓
                         Return status + videoUrl
```

### API Endpoints Reference

**Video Service APIs** (localhost:3105):

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/health` | GET | None | Health check |
| `/v1/tasks/create` | POST | Internal Token | Create video task |
| `/v1/tasks/:id` | GET | Internal Token | Query task status |
| `/v1/callbacks/provider` | POST | Callback Token | Receive provider callbacks |
| `/v1/admin/config` | GET | Admin Token | Get configuration |
| `/v1/admin/config` | PUT | Admin Token | Update configuration |

**Ngrok APIs** (localhost:4040):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tunnels` | GET | List all active tunnels |
| `/api/tunnels/:name` | GET | Get specific tunnel info |
| `/inspect/http` | GET | Web UI for request inspection |

### Configuration Management

**Runtime Configuration** (`credentials/video-service.secrets.json`):
```json
{
  "apiBaseUrl": "http://aibeings-vip.xiaoice.com",
  "apiKey": "431***50f9",
  "modelId": "CVHPZJ4LCGBMNIZULS0",
  "vhBizId": "CVHPZJ4LCGBMNIZULS0",
  "callbackPublicBaseUrl": "https://abc123.ngrok-free.app",
  "providerAuthHeader": "subscription-key",
  "providerAuthScheme": ""
}
```

**Key Field**: `callbackPublicBaseUrl`
- Updated by `update-video-callback.sh`
- Used to construct full callback URL
- Must be ngrok public URL for callbacks to work

**Full Callback URL Construction**:
```javascript
const callbackUrl = `${callbackPublicBaseUrl}/v1/callbacks/provider?token=${VIDEO_SERVICE_CALLBACK_TOKEN}`;
```

Example:
```
https://abc123.ngrok-free.app/v1/callbacks/provider?token=your-callback-token
```

## Admin API Reference

### Update Configuration

**Endpoint**: `PUT /v1/admin/config`

**Purpose**: Update video service runtime configuration, including callback URL

**Authentication**:
```
Header: X-Admin-Token: {VIDEO_SERVICE_ADMIN_TOKEN}
```

**Request Body**:
```json
{
  "callbackPublicBaseUrl": "https://abc123.ngrok-free.app"
}
```

**All Updatable Fields**:
```json
{
  "apiBaseUrl": "http://aibeings-vip.xiaoice.com",
  "apiKey": "your-provider-api-key",
  "modelId": "CVHPZJ4LCGBMNIZULS0",
  "vhBizId": "CVHPZJ4LCGBMNIZULS0",
  "callbackPublicBaseUrl": "https://abc123.ngrok-free.app",
  "providerAuthHeader": "subscription-key",
  "providerAuthScheme": ""
}
```

**Response** (200 OK):
```json
{
  "data": {
    "apiBaseUrl": "http://aibeings-vip.xiaoice.com",
    "apiKey": "431***50f9",
    "modelId": "CVHPZJ4LCGBMNIZULS0",
    "vhBizId": "CVHPZJ4LCGBMNIZULS0",
    "callbackPublicBaseUrl": "https://abc123.ngrok-free.app",
    "providerAuthHeader": "subscription-key",
    "providerAuthScheme": ""
  }
}
```

Note: API key is masked in response for security.

**Error Responses**:

401 Unauthorized:
```json
{
  "error": "Unauthorized"
}
```

400 Bad Request:
```json
{
  "error": "Invalid configuration"
}
```

**Example Usage**:
```bash
curl -X PUT http://127.0.0.1:3105/v1/admin/config \
  -H "X-Admin-Token: your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "callbackPublicBaseUrl": "https://abc123.ngrok-free.app"
  }'
```

### Get Configuration

**Endpoint**: `GET /v1/admin/config`

**Authentication**:
```
Header: X-Admin-Token: {VIDEO_SERVICE_ADMIN_TOKEN}
```

**Response** (200 OK):
```json
{
  "data": {
    "apiBaseUrl": "http://aibeings-vip.xiaoice.com",
    "apiKey": "431***50f9",
    "modelId": "CVHPZJ4LCGBMNIZULS0",
    "vhBizId": "CVHPZJ4LCGBMNIZULS0",
    "callbackPublicBaseUrl": "https://abc123.ngrok-free.app",
    "providerAuthHeader": "subscription-key",
    "providerAuthScheme": ""
  }
}
```

**Example Usage**:
```bash
curl http://127.0.0.1:3105/v1/admin/config \
  -H "X-Admin-Token: your-admin-token"
```

## Best Practices

### Development Workflow

1. **Use automatic mode for seamless development**:
   ```bash
   # In .env
   VIDEO_USE_NGROK=true

   # Just start the service
   ./start-video-service.sh
   ```

2. **Monitor ngrok web UI during development**:
   - Keep `http://localhost:4040` open in browser
   - Watch for incoming callback requests
   - Inspect request/response payloads
   - Debug authentication issues

3. **Check logs regularly**:
   ```bash
   # Video service logs
   tail -f video-service.log

   # Ngrok logs
   tail -f /home/yirongbest/.openclaw/ngrok.log
   ```

4. **Verify after ngrok restart**:
   ```bash
   # Always check status after restart
   ./video-ngrok-status.sh

   # Update callback URL if needed
   ./update-video-callback.sh
   ```

5. **Test callbacks before submitting real tasks**:
   ```bash
   # Use the verification curl command
   PUBLIC_URL=$(cat /home/yirongbest/.openclaw/.video-ngrok-url)
   curl -X POST "${PUBLIC_URL}/v1/callbacks/provider?token=${VIDEO_SERVICE_CALLBACK_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"providerTaskId":"test","videoUrl":"https://example.com/test.mp4"}'
   ```

### Security Practices

1. **Keep tokens secure**:
   - Never commit `.env` file to version control
   - Use strong random tokens (32+ bytes)
   - Rotate tokens every 90 days
   - Store in password manager if needed

2. **Use stable URLs in production**:
   - Free ngrok URLs change on restart
   - Consider ngrok paid plan for reserved domains
   - Or use proper domain with reverse proxy

3. **Monitor for suspicious activity**:
   - Check ngrok web UI for unusual requests
   - Review video service logs for failed auth attempts
   - Set up alerts for repeated 401 errors

4. **Limit ngrok exposure**:
   - Only enable when needed: `VIDEO_USE_NGROK=false` by default
   - Stop ngrok when not in use: `pkill ngrok`
   - Use IP whitelisting if on paid plan

### Operational Practices

1. **Automate common tasks**:
   ```bash
   # Create alias for status check
   alias video-status='cd /home/yirongbest/claw-xiaoice && ./video-ngrok-status.sh'

   # Create alias for callback update
   alias video-update='cd /home/yirongbest/claw-xiaoice && ./update-video-callback.sh'
   ```

2. **Set up monitoring**:
   ```bash
   # Check if services are running
   ps aux | grep -E "ngrok|video-task-service"

   # Check service health
   curl -s http://127.0.0.1:3105/health | jq .
   ```

3. **Document your setup**:
   - Keep notes on your specific configuration
   - Document any custom modifications
   - Track token rotation dates

4. **Backup important data**:
   ```bash
   # Backup database
   cp services/video-task-service/video_tasks.db video_tasks.db.backup

   # Backup configuration
   cp credentials/video-service.secrets.json credentials/video-service.secrets.json.backup
   ```

### Integration with XiaoIce Workflow

**Complete workflow from user request to video delivery**:

1. **User Request**:
   ```
   User: "Create a video of a cat playing piano"
   ```

2. **Tool Invocation**: OpenClaw invokes `xiaoice_video_produce` tool with parameters

3. **Task Creation**: Video service creates task and submits to XiaoIce:
   ```bash
   POST http://aibeings-vip.xiaoice.com/openapi/aivideo/create
   {
     "modelId": "CVHPZJ4LCGBMNIZULS0",
     "callbackUrl": "https://abc123.ngrok-free.app/v1/callbacks/provider?token=xxx",
     "prompt": "a cat playing piano",
     ...
   }
   ```

4. **Response to User**:
   ```
   Assistant: "Video task created with ID: vtask-123. Processing will take 5-10 minutes."
   ```

5. **Video Processing**: XiaoIce processes video (user waits)

6. **Callback Received**: XiaoIce sends callback via ngrok → video service updates database

7. **User Queries Status**:
   ```
   User: "Is my video ready?"
   ```

8. **Status Check**: OpenClaw invokes `xiaoice_video_status` tool

9. **Result Delivered**:
   ```
   Assistant: "Your video is ready! Here's the URL: https://cdn.xiaoice.com/video.mp4"
   ```

**Monitoring the workflow**:
```bash
# Terminal 1: Watch video service logs
tail -f video-service.log

# Terminal 2: Watch ngrok requests
open http://localhost:4040/inspect/http

# Terminal 3: Check status periodically
watch -n 5 './video-ngrok-status.sh'
```

## Troubleshooting Quick Reference

| Problem | Quick Fix |
|---------|-----------|
| Ngrok not running | `./start-ngrok.sh` |
| Video service not running | `./start-video-service.sh` |
| Callback URL not updated | `./update-video-callback.sh` |
| Can't access ngrok UI | Check if port 4040 is free: `lsof -i :4040` |
| 401 errors | Verify tokens in `.env` match service config |
| Tunnel not found | Check `~/.ngrok2/ngrok.yml` and restart ngrok |
| Callback not received | Check ngrok UI at `http://localhost:4040` |
| Port conflict | `pkill ngrok && pkill -f video-task-service` then restart |

## Support and Additional Resources

### Getting Help

1. **Check this guide's troubleshooting section** for common issues

2. **Review logs**:
   ```bash
   # Video service logs
   tail -50 video-service.log

   # Ngrok logs
   tail -50 /home/yirongbest/.openclaw/ngrok.log
   ```

3. **Check ngrok web UI**: `http://localhost:4040`

4. **Verify configuration**:
   ```bash
   ./video-ngrok-status.sh
   ```

5. **Test components individually**:
   ```bash
   # Test video service
   curl http://127.0.0.1:3105/health

   # Test ngrok API
   curl http://localhost:4040/api/tunnels

   # Test callback endpoint
   curl -X POST "${PUBLIC_URL}/v1/callbacks/provider?token=${TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"providerTaskId":"test","videoUrl":"https://example.com/test.mp4"}'
   ```

### Related Documentation

- **Reference Document**: `视频服务Ngrok回调配置方案.md` (Chinese technical specification)
- **Environment Template**: `.env.example` (configuration template)
- **Video Service Code**: `services/video-task-service/server.js`
- **OpenClaw Plugin**: `extensions/video-orchestrator/index.js`

### External Resources

- **Ngrok Documentation**: https://ngrok.com/docs
- **Ngrok Dashboard**: https://dashboard.ngrok.com
- **XiaoIce API Documentation**: (provided by XiaoIce team)

### Common Commands Cheat Sheet

```bash
# Start services
./start-ngrok.sh                    # Start ngrok tunnels
./start-video-service.sh            # Start video service
VIDEO_USE_NGROK=true ./start-video-service.sh  # Start with auto ngrok

# Check status
./video-ngrok-status.sh             # Check ngrok tunnel status
curl http://127.0.0.1:3105/health   # Check video service health
ps aux | grep ngrok                 # Check if ngrok is running

# Update configuration
./update-video-callback.sh          # Update callback URL

# View logs
tail -f video-service.log           # Watch video service logs
tail -f /home/yirongbest/.openclaw/ngrok.log  # Watch ngrok logs

# Stop services
pkill ngrok                         # Stop ngrok
pkill -f video-task-service         # Stop video service

# Test endpoints
curl http://127.0.0.1:3105/health   # Health check
curl http://localhost:4040/api/tunnels  # List ngrok tunnels

# View configuration
cat credentials/video-service.secrets.json | jq .  # View config
cat /home/yirongbest/.openclaw/.video-ngrok-url    # View cached URL
```

---

**Document Version**: 1.0
**Last Updated**: 2026-03-09
**Maintained By**: claw-xiaoice project team
