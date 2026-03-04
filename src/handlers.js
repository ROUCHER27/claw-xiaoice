/**
 * Request Handlers Module
 * Handles HTTP request processing for XiaoIce webhook
 */

const { verifySignature } = require('./auth');
const { extractReplyText } = require('./response-parser');
const OpenClawClient = require('./openclaw-client');

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

  req.on('data', chunk => {
    bodySize += chunk.length;
    if (bodySize > config.maxBodySize) {
      log('WARN', 'Request body too large', { size: bodySize });
      req.destroy();
      return;
    }
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      // Extract and validate authentication headers
      const timestamp = req.headers['x-xiaoice-timestamp'];
      const signature = req.headers['x-xiaoice-signature'];
      const key = req.headers['x-xiaoice-key'];

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

      const payload = JSON.parse(body);
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

      const client = new OpenClawClient(config);

      // Handle streaming response
      if (isStreaming) {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        try {
          await client.sendStreamingMessage(
            { sessionId, askText },
            (chunk) => {
              // Directly send text chunk
              res.write(chunk);
            }
          );

          res.end();
        } catch (error) {
          log('ERROR', 'Streaming error', { error: error.message });

          // Error response as plain text
          const errorText = error.message === 'TIMEOUT' ? '请求超时，请稍后重试' : '处理请求时出错';
          res.write(errorText);
          res.end();
        }

      } else {
        // Handle non-streaming response
        try {
          const result = await client.sendMessage({ sessionId, askText });
          const replyText = extractReplyText(result.response);

          // Return plain text response (for voice playback)
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(replyText);

        } catch (error) {
          log('ERROR', 'Processing error', { error: error.message });

          // Return plain text error response
          const errorText = error.message === 'TIMEOUT' ? '请求超时，请稍后重试' : '处理请求时出错';
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(errorText);
        }
      }

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
