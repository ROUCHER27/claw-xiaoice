/**
 * Request Handlers Module
 * Handles HTTP request processing for XiaoIce webhook
 */

const { verifySignature } = require('./auth');
const { extractReplyText } = require('./response-parser');
const OpenClawClient = require('./openclaw-client');

const DEFAULT_SESSION_ID = 'default';
const DEFAULT_QUEUE_LIMIT = 20;
const DEFAULT_HEARTBEAT_MS = 0;
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
 * Build a XiaoIce-compatible reply envelope.
 * @param {Object} input - Reply input
 * @returns {Object}
 */
function createReplyEnvelope(input) {
  const {
    traceId = '',
    sessionId = '',
    askText = '',
    replyText = '处理请求时出错',
    replyType = 'Llm',
    replyPayload = {},
    isFinal = true,
    extra = { modelName: 'openclaw' }
  } = input;

  return {
    id: generateId(),
    traceId,
    sessionId,
    askText,
    replyText,
    replyType,
    timestamp: Date.now(),
    replyPayload,
    extra,
    isFinal
  };
}

/**
 * Write JSON response if socket is still writable.
 * @param {Object} res - HTTP response
 * @param {number} statusCode - HTTP status code
 * @param {Object} payload - JSON payload
 */
function sendJsonResponse(res, statusCode, payload) {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

/**
 * Write SSE headers.
 * @param {Object} res - HTTP response
 */
function writeSseHeaders(res) {
  if (res.headersSent || res.writableEnded || res.destroyed) {
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
}

/**
 * Write a single SSE message event.
 * @param {Object} res - HTTP response
 * @param {Object} event - Event payload
 */
function sendSseEnvelope(res, event) {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  // Keep XiaoIce compatibility strict: data-only SSE payload.
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.end();
}

/**
 * Start heartbeat comments for SSE connections.
 * @param {Object} res - HTTP response
 * @param {number} heartbeatMs - Interval in milliseconds
 * @returns {Function} Stop heartbeat function
 */
function startSseHeartbeat(res, heartbeatMs) {
  const configuredMs = Number.isFinite(heartbeatMs) ? heartbeatMs : DEFAULT_HEARTBEAT_MS;
  if (configuredMs <= 0) {
    return () => {};
  }

  const intervalMs = configuredMs;

  const timer = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(timer);
      return;
    }

    try {
      res.write(`: keep-alive ${Date.now()}\n\n`);
    } catch (error) {
      clearInterval(timer);
    }
  }, intervalMs);

  const stop = () => clearInterval(timer);
  if (typeof res.once === 'function') {
    res.once('close', stop);
  }

  return stop;
}

/**
 * Drain a single session queue using FIFO ordering.
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
        waitMs: Date.now() - item.queuedAt,
        queueLength: state.queue.length + 1
      });
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    }

    const basePosition = state.running ? 2 : 1;
    state.queue.forEach((queuedItem, index) => {
      queuedItem.queuePosition = basePosition + index;
    });
  }

  state.running = false;

  if (state.queue.length === 0) {
    sessionPipelines.delete(sessionKey);
  }
}

/**
 * Serialize tasks by session using FIFO ordering.
 * @param {string} sessionId - Session ID
 * @param {Function} task - Async task to execute
 * @param {number} maxQueueLength - Maximum in-flight requests per session
 * @returns {Promise<*>} Task result
 */
function enqueueBySession(sessionId, task, maxQueueLength) {
  const key = sessionId || DEFAULT_SESSION_ID;
  let state = sessionPipelines.get(key);

  if (!state) {
    state = { running: false, queue: [] };
    sessionPipelines.set(key, state);
  }

  const limit = Number.isFinite(maxQueueLength) && maxQueueLength > 0
    ? maxQueueLength
    : DEFAULT_QUEUE_LIMIT;

  const inFlight = state.queue.length + (state.running ? 1 : 0);
  if (inFlight >= limit) {
    const error = new Error('SESSION_QUEUE_FULL');
    error.code = 'SESSION_QUEUE_FULL';
    error.inFlight = inFlight;
    throw error;
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
    queuePosition: 1
  };

  state.queue.push(item);

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
 * Send envelope with protocol determined by stream flag.
 * @param {Object} res - HTTP response
 * @param {boolean} isStreaming - Whether to use SSE
 * @param {Object} envelope - XiaoIce envelope
 */
function sendProtocolEnvelope(res, isStreaming, envelope) {
  if (isStreaming) {
    writeSseHeaders(res);
    sendSseEnvelope(res, envelope);
    return;
  }

  sendJsonResponse(res, 200, envelope);
}

/**
 * Handle XiaoIce dialogue webhook
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 * @param {Object} config - Configuration object
 */
async function handleXiaoIceDialogue(req, res, config) {
  log('INFO', `Webhook request: ${req.method} ${req.url}`);

  if (req.method !== 'POST') {
    sendJsonResponse(res, 405, { error: 'Method not allowed' });
    return;
  }

  let requestAborted = false;
  const acceptsSse = req.headers['accept']?.includes('text/event-stream');

  let body = '';
  let bodySize = 0;
  let bodyTooLarge = false;

  req.on('aborted', () => {
    requestAborted = true;
    log('WARN', 'Request aborted by client');
  });

  req.on('error', (error) => {
    log('ERROR', 'Request stream error', { error: error.message });
    if (!res.writableEnded && !res.destroyed) {
      sendJsonResponse(res, 400, { error: 'Invalid request stream' });
    }
  });

  req.on('data', (chunk) => {
    if (bodyTooLarge || requestAborted) {
      return;
    }

    bodySize += chunk.length;
    if (bodySize > config.maxBodySize) {
      bodyTooLarge = true;
      log('WARN', 'Request body too large', { size: bodySize });
      sendJsonResponse(res, 413, { error: 'Payload too large' });

      if (typeof req.destroy === 'function') {
        req.destroy();
      }
      return;
    }

    body += chunk.toString();
  });

  req.on('end', async () => {
    if (bodyTooLarge || requestAborted || res.writableEnded || res.destroyed) {
      return;
    }

    try {
      const timestamp = req.headers['x-xiaoice-timestamp'] || req.headers.timestamp;
      const signature = req.headers['x-xiaoice-signature'] || req.headers.signature;
      const key = req.headers['x-xiaoice-key'] || req.headers.key;

      if (config.authRequired) {
        if (!timestamp || !signature || !key) {
          log('WARN', 'Missing authentication headers');
          sendJsonResponse(res, 401, { error: 'Unauthorized' });
          return;
        }

        if (!verifySignature(body, timestamp, signature, key, config)) {
          log('WARN', 'Authentication failed');
          sendJsonResponse(res, 401, { error: 'Unauthorized' });
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
        sendJsonResponse(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const askTextRaw = typeof payload.askText === 'string' ? payload.askText : '';
      const askText = askTextRaw.trim();
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
      const traceId = typeof payload.traceId === 'string' ? payload.traceId : '';
      const isStreaming = acceptsSse || payload.stream === true;

      log('INFO', 'Received webhook payload', {
        askText: askTextRaw.substring(0, 50),
        sessionId,
        streaming: isStreaming
      });

      if (!askText) {
        log('WARN', 'Empty or missing askText received', { sessionId, hasAskText: !!askTextRaw });
        sendProtocolEnvelope(
          res,
          isStreaming,
          createReplyEnvelope({
            traceId,
            sessionId,
            askText: askTextRaw,
            replyText: '请说点什么吧～',
            replyType: 'Fallback',
            extra: { reason: 'empty_ask_text' }
          })
        );
        return;
      }

      try {
        await enqueueBySession(
          sessionId,
          async ({ queuePosition, waitMs, queueLength }) => {
            const processingStartedAt = Date.now();

            log('INFO', 'Session queue acquired', {
              sessionId: sessionId || DEFAULT_SESSION_ID,
              traceId,
              queuePosition,
              queueLength,
              waitMs
            });

            if (res.writableEnded || res.destroyed) {
              log('WARN', 'Response closed before processing', {
                sessionId: sessionId || DEFAULT_SESSION_ID,
                traceId
              });
              return;
            }

            const client = new OpenClawClient(config);

            if (isStreaming) {
              writeSseHeaders(res);
              const stopHeartbeat = startSseHeartbeat(res, config.sseHeartbeatMs);

              try {
                const result = await client.sendMessage({ sessionId, askText: askTextRaw });
                const replyText = extractReplyText(result.response) || '处理请求时出错';

                sendSseEnvelope(
                  res,
                  createReplyEnvelope({
                    traceId,
                    sessionId,
                    askText: askTextRaw,
                    replyText,
                    replyType: 'Llm',
                    extra: { modelName: 'openclaw' }
                  })
                );
              } catch (error) {
                log('ERROR', 'Streaming error', {
                  error: error.message,
                  sessionId,
                  traceId
                });

                const errorText = error.message === 'TIMEOUT'
                  ? '请求超时，请稍后重试'
                  : '处理请求时出错';

                sendSseEnvelope(
                  res,
                  createReplyEnvelope({
                    traceId,
                    sessionId,
                    askText: askTextRaw,
                    replyText: errorText,
                    replyType: 'Fallback',
                    extra: { error: error.message }
                  })
                );
              } finally {
                stopHeartbeat();
                log('INFO', 'Session queue completed', {
                  sessionId: sessionId || DEFAULT_SESSION_ID,
                  traceId,
                  queuePosition,
                  queueLength,
                  waitMs,
                  processingMs: Date.now() - processingStartedAt
                });
              }

              return;
            }

            try {
              const result = await client.sendMessage({ sessionId, askText: askTextRaw });
              const replyText = extractReplyText(result.response) || '处理请求时出错';

              sendJsonResponse(
                res,
                200,
                createReplyEnvelope({
                  traceId,
                  sessionId,
                  askText: askTextRaw,
                  replyText,
                  replyType: 'Llm',
                  extra: { modelName: 'openclaw' }
                })
              );
            } catch (error) {
              log('ERROR', 'Processing error', {
                error: error.message,
                sessionId,
                traceId
              });

              const errorText = error.message === 'TIMEOUT'
                ? '请求超时，请稍后重试'
                : '处理请求时出错';

              sendJsonResponse(
                res,
                200,
                createReplyEnvelope({
                  traceId,
                  sessionId,
                  askText: askTextRaw,
                  replyText: errorText,
                  replyType: 'Fallback',
                  extra: { error: error.message }
                })
              );
            } finally {
              log('INFO', 'Session queue completed', {
                sessionId: sessionId || DEFAULT_SESSION_ID,
                traceId,
                queuePosition,
                queueLength,
                waitMs,
                processingMs: Date.now() - processingStartedAt
              });
            }
          },
          config.sessionQueueLimit
        );
      } catch (error) {
        if (error.code === 'SESSION_QUEUE_FULL') {
          log('WARN', 'Session queue full', {
            sessionId: sessionId || DEFAULT_SESSION_ID,
            traceId,
            inFlight: error.inFlight,
            limit: config.sessionQueueLimit || DEFAULT_QUEUE_LIMIT
          });

          sendProtocolEnvelope(
            res,
            isStreaming,
            createReplyEnvelope({
              traceId,
              sessionId,
              askText: askTextRaw,
              replyText: '当前会话请求较多，请稍后重试',
              replyType: 'Fallback',
              extra: {
                error: 'SESSION_QUEUE_FULL',
                inFlight: String(error.inFlight || 0)
              }
            })
          );
          return;
        }

        throw error;
      }
    } catch (error) {
      log('ERROR', 'Request processing error', { error: error.message });
      sendJsonResponse(res, 500, { error: 'Internal server error' });
    }
  });
}

/**
 * Handle health check endpoint
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
function handleHealthCheck(req, res) {
  sendJsonResponse(res, 200, {
    status: 'ok',
    service: 'xiaoice-webhook-proxy',
    timestamp: Date.now()
  });
}

module.exports = {
  handleXiaoIceDialogue,
  handleHealthCheck
};
