# Global Video Task Service (Hybrid Mode)

## Architecture

OpenClaw uses a global tool entry (`xiaoice_video_produce`) and delegates async execution to a standalone video service.

```text
Any Channel -> OpenClaw Agent Tool(xiaoice_video_produce) -> Video Service -> Provider /openapi/aivideo/create
                                                             -> Provider Callback -> Task Status
```

This keeps channel runtime and long-running video workflow isolated.

## Components

- `extensions/video-orchestrator/`: global tool bridge plugin
- `services/video-task-service/`: standalone HTTP service with SQLite persistence

## Service Endpoints

- `GET /health`
- `POST /v1/tasks` (`X-Internal-Token`)
- `GET /v1/tasks/:taskId` (`X-Internal-Token`)
- `POST /v1/callbacks/provider` (`X-Callback-Token` header or `?token=...`)
- `PUT /v1/admin/config` (`X-Admin-Token`)

## Required Environment Variables

```bash
VIDEO_TASK_SERVICE_PORT=3105
VIDEO_SERVICE_INTERNAL_TOKEN=...
VIDEO_SERVICE_ADMIN_TOKEN=...
VIDEO_SERVICE_CALLBACK_TOKEN=...
VIDEO_PROVIDER_API_BASE_URL=https://...
VIDEO_PROVIDER_API_KEY=...
VIDEO_PROVIDER_MODEL_ID=CVHPZJ4LCGBMNIZULS0
VIDEO_PROVIDER_VH_BIZ_ID=...
VIDEO_CALLBACK_PUBLIC_BASE_URL=https://...
```

## Start

```bash
./start-video-service.sh
```

Or:

```bash
npm run start:video-service
```

## OpenClaw Plugin Config (example)

```json
{
  "plugins": {
    "entries": {
      "video-orchestrator": {
        "enabled": true,
        "config": {
          "serviceBaseUrl": "http://127.0.0.1:3105",
          "internalToken": "REPLACE_WITH_VIDEO_SERVICE_INTERNAL_TOKEN",
          "requestTimeoutMs": 15000
        }
      }
    }
  }
}
```

## Notes

- Callback updates are idempotent by `providerTaskId`.
- Terminal statuses: `succeeded`, `failed`, `timeout`.
- If callback does not arrive within timeout window, task is marked `timeout` on query.
