/**
 * Request Handlers Module
 * Handles HTTP request processing for XiaoIce webhook
 */

const { verifySignature } = require('./auth');
const { extractReplyText } = require('./response-parser');
const OpenClawClient = require('./openclaw-client');
const sessionPipelines = new Map();

/**
 * Log helper function
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Generate unique ID
 * @returns {string} Unique ID
 */
function generateId() {
  return `xiaoice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Drain a single session queue. The running task is never preempted.
 * Waiting tasks are reordered with "latest first" on enqueue.
 * @param {string} sessionKey - Session key
 * @param {Object} state - Queue state for this session
 * @returns {Promise<void>}
 */
async function drainSessionQueue(sessionKey, state) {
  if (state.running) {
    return;
  }

  state.running = true;

  while (state.queue.length > 0) {
    const item = state.queue.shift();

    try {
      const result = await item.task({
        queuePosition: item.queuePosition,
        waitMs: Date.now() - item.queuedAt
      });
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    }
  }

  state.running = false;

  if (state.queue.length === 0) {
    sessionPipelines.delete(sessionKey);
  }
}

/**
 * Serialize tasks by session while prioritizing the latest waiting request.
 * This keeps single-session writes non-concurrent and reduces stale backlog.
 * @param {string} sessionId - Session ID
 * @param {Function} task - Async task to execute
 * @returns {Promise<*>} Task result
 */
function enqueueBySession(sessionId, task) {
  const key = sessionId || 'default';
  let state = sessionPipelines.get(key);

  if (!state) {
    state = { running: false, queue: [] };
    sessionPipelines.set(key, state);
  }

  const queuedAt = Date.now();
  let resolveTask;
  let rejectTask;

  const promise = new Promise((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });

  const item = {
    queuedAt,
    task,
    resolve: resolveTask,
    reject: rejectTask,
    // Placeholder; recalculated below for the full waiting queue.
    queuePosition: 1
  };

  // Session queue reordering strategy: newest waiting item runs first.
  state.queue.unshift(item);
  // Keep queuePosition aligned with latest-first ordering.
  // Position 1 is the currently running task (if any), so waiting starts at 2.
  const basePosition = state.running ? 2 : 1;
  state.queue.forEach((queuedItem, index) => {
    queuedItem.queuePosition = basePosition + index;
  });

  drainSessionQueue(key, state).catch((error) => {
    log('ERROR', 'Session queue drain failed', {
      sessionId: key,
      error: error.message
    });
  });

  return promise;
}

/**
 * Handle XiaoIce dialogue webhook
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 * @param {Object} config - Configuration object
 */
async function handleXiaoIceDialogue(req, res, config) {
  log('INFO', `Webhook request: ${req.method} ${req.url}`);

  // Only accept POST requests
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Detect streaming request
  const isStreaming = req.headers['accept']?.includes('text/event-stream');

  // Read request body (with size limit)
  let body = '';
  let bodySize = 0;
  let bodyTooLarge = false;

  req.on('data', chunk => {
    if (bodyTooLarge) {
      return;
    }

    bodySize += chunk.length;
    if (bodySize > config.maxBodySize) {
      log('WARN', 'Request body too large', { size: bodySize });
      bodyTooLarge = true;
      if (!res.writableEnded && !res.destroyed) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
      }
      return;
    }
    body += chunk.toString();
  });

  req.on('end', async () => {
    if (bodyTooLarge) {
      return;
    }

    try {
      // Extract and validate authentication headers
      const timestamp = req.headers['x-xiaoice-timestamp'] || req.headers.timestamp;
      const signature = req.headers['x-xiaoice-signature'] || req.headers.signature;
      const key = req.headers['x-xiaoice-key'] || req.headers.key;

      // Authentication check (optional based on config)
      if (config.authRequired) {
        // Check all three headers exist
        if (!timestamp || !signature || !key) {
          log('WARN', 'Missing authentication headers');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        // Verify signature with raw body (before JSON parsing)
        if (!verifySignature(body, timestamp, signature, key, config)) {
          log('WARN', 'Authentication failed');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        log('INFO', 'Authentication passed');
      } else {
        log('WARN', 'Authentication disabled - development mode only');
      }

      let payload;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        log('WARN', 'Invalid JSON payload', { error: error.message });
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      log('INFO', 'Received webhook payload', {
        askText: payload.askText?.substring(0, 50),
        sessionId: payload.sessionId,
        streaming: isStreaming
      });

      const { askText, sessionId, traceId } = payload;

      // Validate required fields and empty text (Bad Case 3 fix)
      if (!askText || askText.trim() === '') {
        log('WARN', 'Empty or missing askText received', { sessionId, hasAskText: !!askText });

        if (isStreaming) {
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
          res.end('请说点什么吧～');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('请说点什么吧～');
        }
        return;
      }

      await enqueueBySession(sessionId, async ({ queuePosition, waitMs }) => {
        log('INFO', 'Session queue acquired', {
          sessionId: sessionId || 'default',
          traceId: traceId || '',
          queuePosition,
          waitMs
        });

        if (res.writableEnded || res.destroyed) {
          log('WARN', 'Response closed before processing', {
            sessionId: sessionId || 'default',
            traceId: traceId || ''
          });
          return;
        }

        const client = new OpenClawClient(config);

        if (isStreaming) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          try {
            const result = await client.sendMessage({ sessionId, askText });
            const replyText = extractReplyText(result.response) || '处理请求时出错';
            const event = {
              id: generateId(),
              traceId: traceId || '',
              sessionId: sessionId || '',
              askText: askText || '',
              replyText,
              replyType: 'Llm',
              timestamp: Date.now(),
              replyPayload: {},
              extra: { modelName: 'openclaw' }
            };

            if (!res.writableEnded && !res.destroyed) {
              res.write(`data: ${JSON.stringify(event)}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
            }
          } catch (error) {
            log('ERROR', 'Streaming error', { error: error.message, sessionId, traceId });

            const errorText = error.message === 'TIMEOUT' ? '请求超时，请稍后重试' : '处理请求时出错';
            const errorEvent = {
              id: generateId(),
              traceId: traceId || '',
              sessionId: sessionId || '',
              askText: askText || '',
              replyText: errorText,
              replyType: 'Fallback',
              timestamp: Date.now(),
              replyPayload: {},
              extra: { error: error.message }
            };

            if (!res.writableEnded && !res.destroyed) {
              res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
            }
          }
        } else {
          try {
            const result = await client.sendMessage({ sessionId, askText });
            const replyText = extractReplyText(result.response) || '处理请求时出错';

            if (!res.writableEnded && !res.destroyed) {
              res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end(replyText);
            }
          } catch (error) {
            log('ERROR', 'Processing error', { error: error.message, sessionId, traceId });

            const errorText = error.message === 'TIMEOUT' ? '请求超时，请稍后重试' : '处理请求时出错';
            if (!res.writableEnded && !res.destroyed) {
              res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end(errorText);
            }
          }
        }
      });

    } catch (error) {
      log('ERROR', 'Request processing error', { error: error.message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
}

/**
 * Handle health check endpoint
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
function handleHealthCheck(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    service: 'xiaoice-webhook-proxy',
    timestamp: Date.now()
  }));
}

module.exports = {
  handleXiaoIceDialogue,
  handleHealthCheck
};
