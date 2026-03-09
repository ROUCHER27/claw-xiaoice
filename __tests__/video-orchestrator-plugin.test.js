const path = require('path');

function loadPluginModule() {
  const modulePath = path.resolve(__dirname, '../extensions/video-orchestrator/index.js');
  delete require.cache[modulePath];
  const mod = require(modulePath);
  return mod.default || mod;
}

function createMockApi(configOverride = {}) {
  return {
    config: {
      plugins: {
        entries: {
          'video-orchestrator': {
            config: {
              serviceBaseUrl: 'http://127.0.0.1:3999',
              internalToken: 'internal-token',
              requestTimeoutMs: 3000,
              ...configOverride
            }
          }
        }
      }
    },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    registerTool: jest.fn()
  };
}

function getRegisteredTool(api) {
  expect(api.registerTool).toHaveBeenCalledTimes(1);
  const [tool] = api.registerTool.mock.calls[0];
  return tool;
}

describe('video-orchestrator plugin', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('register(api) registers exactly one tool named xiaoice_video_produce', async () => {
    const register = loadPluginModule();
    const api = createMockApi();

    register(api);

    expect(api.registerTool).toHaveBeenCalledTimes(1);
    const tool = getRegisteredTool(api);
    expect(tool.name).toBe('xiaoice_video_produce');
    expect(typeof tool.execute).toBe('function');
  });

  it('action=create posts task payload and returns taskId text result', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        data: {
          taskId: 'task-123',
          status: 'submitted'
        }
      })
    });

    const register = loadPluginModule();
    const api = createMockApi();
    register(api);
    const tool = getRegisteredTool(api);

    const result = await tool.execute('call-1', {
      action: 'create',
      prompt: '生成一个发布会视频',
      sessionId: 'session-1',
      traceId: 'trace-1',
      options: {
        voice: 'female',
        style: 'formal'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3999/v1/tasks');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-Internal-Token']).toBe('internal-token');

    const body = JSON.parse(options.body);
    expect(body.prompt).toBe('生成一个发布会视频');
    expect(body.sessionId).toBe('session-1');
    expect(body.traceId).toBe('trace-1');
    expect(body.options).toEqual({ voice: 'female', style: 'formal' });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('task-123');
  });

  it('action=get requests task status and returns payload text result', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          taskId: 'task-abc',
          status: 'succeeded',
          videoUrl: 'https://cdn.example.com/task-abc.mp4'
        }
      })
    });

    const register = loadPluginModule();
    const api = createMockApi();
    register(api);
    const tool = getRegisteredTool(api);

    const result = await tool.execute('call-2', {
      action: 'get',
      taskId: 'task-abc'
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3999/v1/tasks/task-abc');
    expect(options.method).toBe('GET');
    expect(options.headers['X-Internal-Token']).toBe('internal-token');

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('succeeded');
    expect(result.content[0].text).toContain('task-abc');
  });

  it('returns isError=true on invalid params and unknown action', async () => {
    const register = loadPluginModule();
    const api = createMockApi();
    register(api);
    const tool = getRegisteredTool(api);

    const missingPrompt = await tool.execute('call-3', {
      action: 'create'
    });
    expect(missingPrompt.isError).toBe(true);
    expect(missingPrompt.content[0].text).toMatch(/prompt/i);

    const missingTaskId = await tool.execute('call-4', {
      action: 'get'
    });
    expect(missingTaskId.isError).toBe(true);
    expect(missingTaskId.content[0].text).toMatch(/taskId/i);

    const unknownAction = await tool.execute('call-5', {
      action: 'something-else',
      taskId: 'task-1'
    });
    expect(unknownAction.isError).toBe(true);
    expect(unknownAction.content[0].text).toMatch(/unknown action/i);
  });

  it('returns isError=true on fetch/network failure without uncaught throw', async () => {
    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const register = loadPluginModule();
    const api = createMockApi();
    register(api);
    const tool = getRegisteredTool(api);

    const result = await tool.execute('call-6', {
      action: 'create',
      prompt: 'hello'
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/ECONNREFUSED|fetch/i);
  });
});
