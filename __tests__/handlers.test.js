/**
 * Handlers Module Tests
 */

const { EventEmitter } = require('events');
const { handleXiaoIceDialogue, handleHealthCheck } = require('../src/handlers');

function createMockRequest(options = {}) {
  const req = new EventEmitter();
  req.method = options.method || 'POST';
  req.url = options.url || '/webhooks/xiaoice';
  req.headers = options.headers || {};
  req.destroyed = false;
  req.destroy = jest.fn(() => {
    req.destroyed = true;
  });

  if (options.body !== undefined) {
    process.nextTick(() => {
      req.emit('data', Buffer.from(options.body));
      req.emit('end');
    });
  }

  return req;
}

function createMockResponse() {
  const res = new EventEmitter();
  res.statusCode = null;
  res.headers = {};
  res.body = '';
  res.writableEnded = false;
  res.destroyed = false;
  res.headersSent = false;

  res.writeHead = function writeHead(code, headers) {
    this.statusCode = code;
    this.headers = headers || {};
    this.headersSent = true;
  };
  res.write = function write(chunk) {
    this.body += chunk.toString();
  };
  res.end = function end(data) {
    if (data) {
      this.body += data.toString();
    }
    this.writableEnded = true;
    this.emit('close');
  };
  res.destroy = function destroy() {
    this.destroyed = true;
    this.emit('close');
  };

  return res;
}

function parseSseDataLines(body) {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.replace(/^data:\s*/, ''));
}

describe('handleXiaoIceDialogue', () => {
  const config = {
    authRequired: false,
    maxBodySize: 1024 * 1024,
    timeout: 25000,
    sessionQueueLimit: 20,
    sseHeartbeatMs: 1000
  };

  it('returns envelope JSON for empty askText in non-streaming mode', (done) => {
    const req = createMockRequest({
      body: JSON.stringify({
        askText: '',
        sessionId: 'test-session-empty',
        traceId: 'trace-empty'
      })
    });
    const res = createMockResponse();

    handleXiaoIceDialogue(req, res, config);

    setTimeout(() => {
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('application/json; charset=utf-8');

      const body = JSON.parse(res.body);
      expect(body.replyType).toBe('Fallback');
      expect(body.replyText).toBe('请说点什么吧～');
      expect(body.traceId).toBe('trace-empty');
      expect(body.sessionId).toBe('test-session-empty');
      expect(body.isFinal).toBe(true);
      done();
    }, 100);
  });

  it('returns SSE envelope for empty askText in streaming mode', (done) => {
    const req = createMockRequest({
      headers: { accept: 'text/event-stream' },
      body: JSON.stringify({
        askText: '  ',
        sessionId: 'test-session-empty-stream',
        traceId: 'trace-empty-stream'
      })
    });
    const res = createMockResponse();

    handleXiaoIceDialogue(req, res, config);

    setTimeout(() => {
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('text/event-stream; charset=utf-8');

      const dataLines = parseSseDataLines(res.body);
      expect(dataLines.length).toBe(1);

      const event = JSON.parse(dataLines[0]);
      expect(event.replyType).toBe('Fallback');
      expect(event.replyText).toBe('请说点什么吧～');
      expect(event.traceId).toBe('trace-empty-stream');
      expect(event.isFinal).toBe(true);
      expect(res.body).not.toContain('[DONE]');
      done();
    }, 100);
  });

  it('rejects non-POST requests', (done) => {
    const req = createMockRequest({
      method: 'GET',
      body: ''
    });
    const res = createMockResponse();

    handleXiaoIceDialogue(req, res, config);

    setTimeout(() => {
      expect(res.statusCode).toBe(405);
      expect(JSON.parse(res.body).error).toBe('Method not allowed');
      done();
    }, 50);
  });

  it('returns 400 for invalid JSON payload', (done) => {
    const req = createMockRequest({
      body: '{"askText":"hello",'
    });
    const res = createMockResponse();

    handleXiaoIceDialogue(req, res, config);

    setTimeout(() => {
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Invalid JSON body' });
      done();
    }, 80);
  });

  it('returns 413 and destroys request when body is too large', (done) => {
    const tinyLimitConfig = {
      ...config,
      maxBodySize: 16
    };
    const req = createMockRequest({
      body: JSON.stringify({
        askText: 'this-message-is-intentionally-too-long',
        sessionId: 'oversize-session'
      })
    });
    const res = createMockResponse();

    handleXiaoIceDialogue(req, res, tinyLimitConfig);

    setTimeout(() => {
      expect(res.statusCode).toBe(413);
      expect(JSON.parse(res.body)).toEqual({ error: 'Payload too large' });
      expect(req.destroy).toHaveBeenCalled();
      done();
    }, 80);
  });
});

describe('handleHealthCheck', () => {
  it('returns health status JSON', () => {
    const req = {};
    const res = createMockResponse();

    handleHealthCheck(req, res);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('xiaoice-webhook-proxy');
    expect(body.timestamp).toBeDefined();
  });
});
