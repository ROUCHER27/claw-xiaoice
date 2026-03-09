function toPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toErrorResult(message) {
  return {
    content: [{ type: 'text', text: String(message || 'Unknown error') }],
    isError: true
  };
}

function toSuccessResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError: false
  };
}

function resolveConfig(api) {
  const raw = api?.config?.plugins?.entries?.['video-orchestrator']?.config || {};
  return {
    serviceBaseUrl: String(raw.serviceBaseUrl || process.env.VIDEO_SERVICE_BASE_URL || 'http://127.0.0.1:3105')
      .replace(/\/+$/, ''),
    internalToken: String(raw.internalToken || process.env.VIDEO_SERVICE_INTERNAL_TOKEN || 'video-internal-token'),
    requestTimeoutMs: toPositiveInt(raw.requestTimeoutMs || process.env.VIDEO_SERVICE_REQUEST_TIMEOUT_MS, 15000)
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function register(api) {
  const logger = api?.logger || console;

  api.registerTool({
    name: 'xiaoice_video_produce',
    description: 'Create and query asynchronous video generation tasks via the standalone video service.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'get'],
          description: 'create to submit a task; get to query task status'
        },
        prompt: {
          type: 'string',
          description: 'Prompt text for video generation (required for create)'
        },
        taskId: {
          type: 'string',
          description: 'Task ID to query (required for get)'
        },
        sessionId: {
          type: 'string',
          description: 'Optional session identifier'
        },
        traceId: {
          type: 'string',
          description: 'Optional trace identifier'
        },
        options: {
          type: 'object',
          description: 'Optional provider-specific create payload'
        }
      },
      required: ['action']
    },
    async execute(_id, params) {
      try {
        const cfg = resolveConfig(api);

        if (!params || typeof params !== 'object') {
          return toErrorResult('params is required');
        }

        if (params.action === 'create') {
          const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
          if (!prompt) {
            return toErrorResult('prompt is required for action=create');
          }

          const resp = await fetchWithTimeout(
            `${cfg.serviceBaseUrl}/v1/tasks`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Token': cfg.internalToken
              },
              body: JSON.stringify({
                prompt,
                sessionId: typeof params.sessionId === 'string' ? params.sessionId : '',
                traceId: typeof params.traceId === 'string' ? params.traceId : '',
                options: params.options && typeof params.options === 'object' ? params.options : {}
              })
            },
            cfg.requestTimeoutMs
          );

          const body = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            return toErrorResult(body?.error?.message || `video service returned HTTP ${resp.status}`);
          }

          return toSuccessResult(body?.data || body);
        }

        if (params.action === 'get') {
          const taskId = typeof params.taskId === 'string' ? params.taskId.trim() : '';
          if (!taskId) {
            return toErrorResult('taskId is required for action=get');
          }

          const resp = await fetchWithTimeout(
            `${cfg.serviceBaseUrl}/v1/tasks/${encodeURIComponent(taskId)}`,
            {
              method: 'GET',
              headers: {
                'X-Internal-Token': cfg.internalToken
              }
            },
            cfg.requestTimeoutMs
          );

          const body = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            return toErrorResult(body?.error?.message || `video service returned HTTP ${resp.status}`);
          }

          return toSuccessResult(body?.data || body);
        }

        return toErrorResult(`Unknown action: ${String(params.action)}`);
      } catch (error) {
        logger.error?.('[video-orchestrator] execute failed', error);
        return toErrorResult(error?.message || 'xiaoice_video_produce execution failed');
      }
    }
  });

  logger.info?.('[video-orchestrator] plugin registered');
}

module.exports = register;
module.exports.default = register;
