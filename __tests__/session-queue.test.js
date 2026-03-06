/**
 * Session queue behavior tests
 */

const { EventEmitter } = require('events');

jest.mock('../src/openclaw-client', () => {
  return jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage
  }));
});

const mockSendMessage = jest.fn();
const { handleXiaoIceDialogue } = require('../src/handlers');

function createMockRequest(options = {}) {
  const req = new EventEmitter();
  req.method = options.method || 'POST';
  req.url = options.url || '/webhooks/xiaoice';
  req.headers = options.headers || {};

  process.nextTick(() => {
    req.emit('data', Buffer.from(options.body || ''));
    req.emit('end');
  });

  return req;
}

function sendStreamingRequest(payload, config) {
  return new Promise((resolve) => {
    const req = createMockRequest({
      method: 'POST',
      headers: { accept: 'text/event-stream' },
      body: JSON.stringify(payload)
    });

    const res = {
      statusCode: null,
      headers: {},
      body: '',
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      writeHead(code, headers) {
        this.statusCode = code;
        this.headers = headers || {};
        this.headersSent = true;
      },
      write(chunk) {
        this.body += chunk.toString();
      },
      end(data) {
        if (data) {
          this.body += data.toString();
        }
        this.writableEnded = true;
        resolve(this);
      }
    };

    handleXiaoIceDialogue(req, res, config);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('session queue', () => {
  const config = {
    authRequired: false,
    maxBodySize: 1024 * 1024,
    timeout: 5000,
    sessionQueueLimit: 20,
    sseHeartbeatMs: 1000
  };

  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  it('serializes requests for the same sessionId', async () => {
    let active = 0;
    let maxActive = 0;

    mockSendMessage.mockImplementation(async ({ askText }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(askText === 'first' ? 80 : 10);
      active -= 1;
      return {
        ok: true,
        response: JSON.stringify({
          result: { payloads: [{ text: `ok-${askText}` }] }
        })
      };
    });

    const sessionId = 'same-session';
    const r1 = sendStreamingRequest({ askText: 'first', sessionId, traceId: 't1' }, config);
    const r2 = sendStreamingRequest({ askText: 'second', sessionId, traceId: 't2' }, config);

    const [res1, res2] = await Promise.all([r1, r2]);

    expect(maxActive).toBe(1);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.body).toContain('"replyText":"ok-first"');
    expect(res2.body).toContain('"replyText":"ok-second"');
    expect(res1.body).toContain('"isFinal":true');
    expect(res2.body).toContain('"isFinal":true');
    expect(res1.body).not.toContain('event:');
    expect(res2.body).not.toContain('event:');
    expect(res1.body).not.toContain(': keep-alive');
    expect(res2.body).not.toContain(': keep-alive');
    expect(res1.body).not.toContain('[DONE]');
    expect(res2.body).not.toContain('[DONE]');
  });

  it('keeps processing after a timeout-like failure in the same session', async () => {
    mockSendMessage.mockImplementation(async ({ askText }) => {
      if (askText === 'first-timeout') {
        throw new Error('TIMEOUT');
      }
      return {
        ok: true,
        response: JSON.stringify({
          result: { payloads: [{ text: 'second-ok' }] }
        })
      };
    });

    const sessionId = 'recover-session';
    const r1 = sendStreamingRequest({ askText: 'first-timeout', sessionId, traceId: 't1' }, config);
    const r2 = sendStreamingRequest({ askText: 'second-success', sessionId, traceId: 't2' }, config);

    const [res1, res2] = await Promise.all([r1, r2]);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.body).toContain('"replyType":"Fallback"');
    expect(res1.body).toContain('"error":"TIMEOUT"');
    expect(res2.body).toContain('"replyType":"Llm"');
    expect(res2.body).toContain('"replyText":"second-ok"');
  });

  it('allows parallel processing across different sessions', async () => {
    let active = 0;
    let maxActive = 0;

    mockSendMessage.mockImplementation(async ({ askText }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(40);
      active -= 1;
      return {
        ok: true,
        response: JSON.stringify({
          result: { payloads: [{ text: `ok-${askText}` }] }
        })
      };
    });

    const r1 = sendStreamingRequest({ askText: 'a', sessionId: 's1', traceId: 't1' }, config);
    const r2 = sendStreamingRequest({ askText: 'b', sessionId: 's2', traceId: 't2' }, config);

    const [res1, res2] = await Promise.all([r1, r2]);

    expect(maxActive).toBeGreaterThan(1);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
  });

  it('processes waiting requests in FIFO order within the same session', async () => {
    const executionOrder = [];
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      mockSendMessage.mockImplementation(async ({ askText }) => {
        executionOrder.push(askText);
        if (askText === 'first') {
          await wait(80);
        } else {
          await wait(5);
        }
        return {
          ok: true,
          response: JSON.stringify({
            result: { payloads: [{ text: `ok-${askText}` }] }
          })
        };
      });

      const sessionId = 'reorder-session';
      const r1 = sendStreamingRequest({ askText: 'first', sessionId, traceId: 't1' }, config);
      await wait(10);
      const r2 = sendStreamingRequest({ askText: 'second', sessionId, traceId: 't2' }, config);
      await wait(10);
      const r3 = sendStreamingRequest({ askText: 'third', sessionId, traceId: 't3' }, config);

      const [res1, res2, res3] = await Promise.all([r1, r2, r3]);

      expect(executionOrder).toEqual(['first', 'second', 'third']);
      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      expect(res3.statusCode).toBe(200);
      expect(res1.body).toContain('"replyText":"ok-first"');
      expect(res2.body).toContain('"replyText":"ok-second"');
      expect(res3.body).toContain('"replyText":"ok-third"');

      const queueAcquireLogs = logSpy.mock.calls
        .map((call) => call[0])
        .filter((value) => typeof value === 'string' && value.includes('"queuePosition"'))
        .map((value) => JSON.parse(value));

      const secondQueueLog = queueAcquireLogs.find((entry) => entry.traceId === 't2');
      const thirdQueueLog = queueAcquireLogs.find((entry) => entry.traceId === 't3');

      expect(secondQueueLog.queuePosition).toBe(2);
      expect(thirdQueueLog.queuePosition).toBe(2);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('returns fallback when session queue is full', async () => {
    const limitedConfig = {
      ...config,
      sessionQueueLimit: 2
    };

    mockSendMessage.mockImplementation(async ({ askText }) => {
      if (askText === 'first') {
        await wait(80);
      } else {
        await wait(5);
      }

      return {
        ok: true,
        response: JSON.stringify({
          result: { payloads: [{ text: `ok-${askText}` }] }
        })
      };
    });

    const sessionId = 'queue-full-session';
    const r1 = sendStreamingRequest({ askText: 'first', sessionId, traceId: 'q1' }, limitedConfig);
    await wait(5);
    const r2 = sendStreamingRequest({ askText: 'second', sessionId, traceId: 'q2' }, limitedConfig);
    await wait(5);
    const r3 = sendStreamingRequest({ askText: 'third', sessionId, traceId: 'q3' }, limitedConfig);

    const [res1, res2, res3] = await Promise.all([r1, r2, r3]);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res3.statusCode).toBe(200);
    expect(res3.body).toContain('"replyType":"Fallback"');
    expect(res3.body).toContain('"error":"SESSION_QUEUE_FULL"');
    expect(res3.body).toContain('"isFinal":true');
    expect(res3.body).not.toContain('event:');
    expect(res3.body).not.toContain(': keep-alive');
    expect(res3.body).not.toContain('[DONE]');
  });
});
