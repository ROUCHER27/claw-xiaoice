const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { startVideoTaskService } = require('../services/video-task-service/server');
const MODEL_ID = 'CVHPZJ4LCGBMNIZULS0';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'video-task-service-'));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson({ baseUrl, method, route, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, baseUrl);
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      url,
      {
        method,
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk.toString();
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (error) {
            return reject(new Error(`Invalid JSON response: ${raw}`));
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function waitFor(predicate, timeoutMs = 1500, intervalMs = 25) {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt <= timeoutMs) {
    lastValue = await predicate();
    if (lastValue) {
      return lastValue;
    }
    await wait(intervalMs);
  }
  throw new Error(`waitFor timeout after ${timeoutMs}ms`);
}

describe('video task service', () => {
  let tempDir;
  let service;
  let baseUrl;
  let originalFetch;
  let nowMs;

  beforeEach(async () => {
    tempDir = createTempDir();
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    nowMs = Date.now();

    service = await startVideoTaskService({
      port: 0,
      dbPath: path.join(tempDir, 'video-tasks.db'),
      secretsPath: path.join(tempDir, 'video-secrets.json'),
      internalToken: 'internal-token',
      adminToken: 'admin-token',
      callbackToken: 'callback-token',
      providerModelId: MODEL_ID,
      taskTimeoutMs: 100,
      providerSubmitMaxRetries: 3,
      providerSubmitRetryDelaysMs: [5, 5],
      now: () => nowMs
    });
    baseUrl = `http://127.0.0.1:${service.port}`;
  });

  afterEach(async () => {
    if (service && typeof service.close === 'function') {
      await service.close();
    }
    global.fetch = originalFetch;
  });

  it('POST /v1/tasks returns 202 submitted quickly and background submit retries before processing', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'server error',
        json: async () => ({ error: 'upstream failed' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'bad gateway',
        json: async () => ({ error: 'bad gateway' })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ taskId: 'provider-001' })
      });

    const startedAt = Date.now();
    const created = await requestJson({
      baseUrl,
      method: 'POST',
      route: '/v1/tasks',
      headers: {
        'X-Internal-Token': 'internal-token'
      },
      body: {
        prompt: '生成产品介绍视频',
        sessionId: 'session-1',
        traceId: 'trace-1'
      }
    });
    const elapsedMs = Date.now() - startedAt;

    expect(created.statusCode).toBe(202);
    expect(created.body.data.status).toBe('submitted');
    expect(created.body.data.taskId).toBeTruthy();
    expect(elapsedMs).toBeLessThan(1000);

    const taskId = created.body.data.taskId;
    const processed = await waitFor(async () => {
      const statusResp = await requestJson({
        baseUrl,
        method: 'GET',
        route: `/v1/tasks/${taskId}`,
        headers: {
          'X-Internal-Token': 'internal-token'
        }
      });
      if (statusResp.body?.data?.status === 'processing') {
        return statusResp;
      }
      return null;
    }, 2000);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    const [, firstCallOptions] = global.fetch.mock.calls[0];
    const firstCallBody = JSON.parse(firstCallOptions.body);
    expect(firstCallBody.modelId).toBe(MODEL_ID);
    expect(processed.body.data.providerTaskId).toBe('provider-001');
  });

  it('callback marks task succeeded and duplicate callback is idempotent', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ taskId: 'provider-002' })
    });

    const created = await requestJson({
      baseUrl,
      method: 'POST',
      route: '/v1/tasks',
      headers: {
        'X-Internal-Token': 'internal-token'
      },
      body: {
        prompt: '生成回调测试视频',
        sessionId: 'session-2',
        traceId: 'trace-2'
      }
    });

    const taskId = created.body.data.taskId;
    await waitFor(async () => {
      const statusResp = await requestJson({
        baseUrl,
        method: 'GET',
        route: `/v1/tasks/${taskId}`,
        headers: {
          'X-Internal-Token': 'internal-token'
        }
      });
      if (statusResp.body?.data?.providerTaskId) {
        return statusResp;
      }
      return null;
    });

    const callbackPayload = {
      providerTaskId: 'provider-002',
      videoUrl: 'https://cdn.example.com/video-002.mp4'
    };

    const callbackResp1 = await requestJson({
      baseUrl,
      method: 'POST',
      route: '/v1/callbacks/provider',
      headers: {
        'X-Callback-Token': 'callback-token'
      },
      body: callbackPayload
    });
    expect(callbackResp1.statusCode).toBe(200);

    const callbackResp2 = await requestJson({
      baseUrl,
      method: 'POST',
      route: '/v1/callbacks/provider',
      headers: {
        'X-Callback-Token': 'callback-token'
      },
      body: callbackPayload
    });
    expect(callbackResp2.statusCode).toBe(200);

    const finalResp = await requestJson({
      baseUrl,
      method: 'GET',
      route: `/v1/tasks/${taskId}`,
      headers: {
        'X-Internal-Token': 'internal-token'
      }
    });

    expect(finalResp.statusCode).toBe(200);
    expect(finalResp.body.data.status).toBe('succeeded');
    expect(finalResp.body.data.videoUrl).toBe('https://cdn.example.com/video-002.mp4');
  });

  it('returns 401 for unauthorized internal/admin/callback routes', async () => {
    const unauthCreate = await requestJson({
      baseUrl,
      method: 'POST',
      route: '/v1/tasks',
      body: {
        prompt: 'unauthorized'
      }
    });
    expect(unauthCreate.statusCode).toBe(401);

    const unauthGet = await requestJson({
      baseUrl,
      method: 'GET',
      route: '/v1/tasks/any-task-id'
    });
    expect(unauthGet.statusCode).toBe(401);

    const unauthAdmin = await requestJson({
      baseUrl,
      method: 'PUT',
      route: '/v1/admin/config',
      body: {
        apiKey: 'new-key'
      }
    });
    expect(unauthAdmin.statusCode).toBe(401);

    const unauthCallback = await requestJson({
      baseUrl,
      method: 'POST',
      route: '/v1/callbacks/provider',
      body: {
        providerTaskId: 'p-1',
        videoUrl: 'https://cdn.example.com/test.mp4'
      }
    });
    expect(unauthCallback.statusCode).toBe(401);
  });

  it('marks stale processing task as timeout on query', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ taskId: 'provider-timeout' })
    });

    const created = await requestJson({
      baseUrl,
      method: 'POST',
      route: '/v1/tasks',
      headers: {
        'X-Internal-Token': 'internal-token'
      },
      body: {
        prompt: '测试超时',
        sessionId: 'session-timeout',
        traceId: 'trace-timeout'
      }
    });
    const taskId = created.body.data.taskId;

    await waitFor(async () => {
      const statusResp = await requestJson({
        baseUrl,
        method: 'GET',
        route: `/v1/tasks/${taskId}`,
        headers: {
          'X-Internal-Token': 'internal-token'
        }
      });
      return statusResp.body?.data?.status === 'processing' ? statusResp : null;
    });

    nowMs += 1000;
    const timedOut = await requestJson({
      baseUrl,
      method: 'GET',
      route: `/v1/tasks/${taskId}`,
      headers: {
        'X-Internal-Token': 'internal-token'
      }
    });

    expect(timedOut.statusCode).toBe(200);
    expect(timedOut.body.data.status).toBe('timeout');
  });
});
