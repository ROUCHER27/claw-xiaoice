/**
 * Handlers Module Tests
 */

const { handleXiaoIceDialogue, handleHealthCheck } = require('../src/handlers');
const { EventEmitter } = require('events');

/**
 * Create mock request object
 */
function createMockRequest(options = {}) {
  const req = new EventEmitter();
  req.method = options.method || 'POST';
  req.url = options.url || '/webhooks/xiaoice';
  req.headers = options.headers || {};

  // Simulate request body
  if (options.body) {
    process.nextTick(() => {
      req.emit('data', Buffer.from(options.body));
      req.emit('end');
    });
  }

  return req;
}

/**
 * Create mock response object
 */
function createMockResponse() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers || {};
    },
    write(chunk) {
      this.body += chunk.toString();
    },
    end(data) {
      if (data) {
        this.body += data.toString();
      }
      this.finished = true;
    },
    destroy() {
      this.destroyed = true;
    }
  };
  return res;
}

describe('handleXiaoIceDialogue', () => {
  const config = {
    authRequired: false,
    maxBodySize: 1024 * 1024,
    timeout: 25000
  };

  it('should handle empty askText gracefully (non-streaming)', (done) => {
    const req = createMockRequest({
      method: 'POST',
      headers: {},
      body: JSON.stringify({
        askText: '',
        sessionId: 'test-session-empty'
      })
    });
    const res = createMockResponse();

    handleXiaoIceDialogue(req, res, config);

    // Wait for async processing
    setTimeout(() => {
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(res.body).toBe('请说点什么吧～');
      done();
    }, 100);
  });

  it('should handle whitespace-only askText gracefully (non-streaming)', (done) => {
    const req = createMockRequest({
      method: 'POST',
      headers: {},
      body: JSON.stringify({
        askText: '   ',
        sessionId: 'test-session-whitespace'
      })
    });
    const res = createMockResponse();

    handleXiaoIceDialogue(req, res, config);

    setTimeout(() => {
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('请说点什么吧～');
      done();
    }, 100);
  });

  it('should handle empty askText gracefully (streaming)', (done) => {
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'accept': 'text/event-stream'
      },
      body: JSON.stringify({
        askText: '',
        sessionId: 'test-session-empty-stream'
      })
    });
    const res = createMockResponse();

    handleXiaoIceDialogue(req, res, config);

    setTimeout(() => {
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(res.body).toBe('请说点什么吧～');
      done();
    }, 100);
  });

  it('should reject non-POST requests', (done) => {
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

  it('should reject missing askText field', (done) => {
    const req = createMockRequest({
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'test-session-no-asktext'
      })
    });
    const res = createMockResponse();

    handleXiaoIceDialogue(req, res, config);

    setTimeout(() => {
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('请说点什么吧～');
      done();
    }, 100);
  });
});

describe('handleHealthCheck', () => {
  it('should return health status', () => {
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
