#!/usr/bin/env node

/**
 * XiaoIce Webhook Proxy
 * 接收 HTTP Webhook 请求，转发到 OpenClaw Gateway
 * 
 * 使用方式:
 * 1. node webhook-proxy.js
 * 2. ngrok http 3002
 * 3. 配置 XiaoIce Webhook URL 为 ngrok 地址
 */

const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');


const PORT = process.env.PORT || 3002;

// XiaoIce Configuration - Load from environment or use defaults
const XIAOICE_CONFIG = {
  accessKey: process.env.XIAOICE_ACCESS_KEY || 'test-key',
  secretKey: process.env.XIAOICE_SECRET_KEY || 'test-secret',
  timeout: parseInt(process.env.XIAOICE_TIMEOUT || '25000', 10),
  maxBodySize: 10 * 1024 * 1024, // 10MB
  timestampWindow: 300000, // 5 minutes
  authRequired: process.env.XIAOICE_AUTH_REQUIRED !== 'false', // Default: enabled
  voiceOptimization: process.env.XIAOICE_VOICE_OPTIMIZATION !== 'false' // Default: enabled
};

// 日志函数
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// 根据问题复杂度选择 thinking level
function selectThinkingLevel(askText) {
  const length = askText.length;

  // 检测是否包含复杂关键词（需要工具调用或深度思考）
  const complexKeywords = ['天气', '查询', '搜索', '计算', '分析', '解释', '为什么', '怎么样', '如何'];
  const hasComplexKeyword = complexKeywords.some(keyword => askText.includes(keyword));

  // Very short simple greetings: minimal thinking
  if (length < 10 && !hasComplexKeyword) {
    return 'minimal';  // Fastest - only for "你好", "嗨" etc
  }

  // Short questions with complex keywords: medium thinking
  if (length < 50 && hasComplexKeyword) {
    return 'medium';
  }

  // Short questions: low thinking
  if (length < 100) {
    return 'low';
  }

  // Medium questions: medium thinking
  if (length < 300) {
    return 'medium';
  }

  // Long/complex questions: high thinking
  return 'high';
}

// 格式化文本以适配语音输出
function formatForVoice(text) {
  if (!text) return text;

  // Remove markdown formatting
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');  // **bold** → bold
  text = text.replace(/\*(.+?)\*/g, '$1');      // *italic* → italic
  text = text.replace(/`(.+?)`/g, '$1');        // `code` → code
  text = text.replace(/^#+\s+/gm, '');          // # headers → plain text

  // Remove list markers
  text = text.replace(/^[\-\*]\s+/gm, '');      // - item → item
  text = text.replace(/^\d+\.\s+/gm, '');       // 1. item → item

  // Remove emojis (keep Chinese characters)
  text = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');  // Remove emojis
  text = text.replace(/[\u{2600}-\u{26FF}]/gu, '');    // Remove symbols
  text = text.replace(/[\u{FE00}-\u{FE0F}]/gu, '');    // Remove variation selectors
  text = text.replace(/[\u{E0000}-\u{E007F}]/gu, ''); // Remove tag characters

  // Clean up extra whitespace and newlines
  text = text.replace(/\n{3,}/g, '\n\n');       // Max 2 newlines
  text = text.replace(/\n/g, '，');              // Newlines → commas for voice
  text = text.replace(/，{2,}/g, '，');          // Remove duplicate commas
  text = text.replace(/\s+/g, ' ');             // Normalize spaces
  text = text.trim();

  return text;
}

// 调用 OpenClaw CLI 处理消息
async function sendToOpenClaw(payload, isStreaming = false, streamCallback = null) {
  return new Promise((resolve, reject) => {
    const { sessionId, askText } = payload;
    let completed = false;
    let timeoutHandle = null;
    const startTime = Date.now();

    // 根据问题复杂度选择 thinking level
    const thinkingLevel = selectThinkingLevel(askText);

    // 构建 OpenClaw agent 命令
    const args = [
      'agent',
      '--channel', 'xiaoice',
      '--to', sessionId || 'default',
      '--message', askText || '',
      '--thinking', thinkingLevel,
      '--json'
    ];

    log('INFO', 'Calling OpenClaw CLI', { args, streaming: isStreaming, thinkingLevel, questionLength: askText.length });

    const openclaw = spawn('openclaw', args, {
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    // Cleanup function
    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      openclaw.stdout.removeAllListeners();
      openclaw.stderr.removeAllListeners();
      openclaw.removeAllListeners();
    };

    // Set 18-second timeout
    timeoutHandle = setTimeout(() => {
      if (completed) return;
      completed = true;

      log('ERROR', 'OpenClaw timeout', { timeout: XIAOICE_CONFIG.timeout });
      openclaw.kill('SIGTERM');

      cleanup();
      reject(new Error('TIMEOUT'));
    }, XIAOICE_CONFIG.timeout);

    openclaw.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;

      // Stream chunks if in streaming mode
      if (isStreaming && streamCallback) {
        streamCallback(chunk);
      }
    });

    openclaw.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    openclaw.on('close', (code) => {
      if (completed) return;
      completed = true;

      cleanup();

      if (code === 0) {
        log('INFO', 'OpenClaw response', { stdout: stdout.substring(0, 200) + '...' });

        // Performance metrics
        const processingTime = Date.now() - startTime;
        const cacheHit = stdout.includes('cacheRead');
        log('INFO', 'Performance metrics', {
          thinkingLevel,
          questionLength: askText.length,
          processingTime,
          cacheHit
        });

        resolve({ ok: true, response: stdout });
      } else {
        log('ERROR', 'OpenClaw error', { code, stderr });
        reject(new Error(`OpenClaw exited with code ${code}: ${stderr}`));
      }
    });

    openclaw.on('error', (error) => {
      if (completed) return;
      completed = true;

      cleanup();
      log('ERROR', 'Failed to spawn OpenClaw', { error: error.message });
      reject(error);
    });
  });
}

// 提取 OpenClaw 响应中的回复文本
function extractReplyText(stdout) {
  try {
    // 尝试解析整个 stdout 为 JSON
    const json = JSON.parse(stdout.trim());

    // 新格式：{ runId, status, result: { payloads: [{ text, mediaUrl }] } }
    if (json.result && json.result.payloads && Array.isArray(json.result.payloads)) {
      const firstPayload = json.result.payloads[0];
      if (firstPayload && firstPayload.text) {
        return firstPayload.text;
      }
    }

    // 旧格式兼容：{ response: { text } }
    if (json.response && json.response.text) {
      return json.response.text;
    }

    // 如果是多行 JSONL 格式，逐行解析
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      try {
        const lineJson = JSON.parse(line);

        // 新格式
        if (lineJson.result && lineJson.result.payloads && Array.isArray(lineJson.result.payloads)) {
          const firstPayload = lineJson.result.payloads[0];
          if (firstPayload && firstPayload.text) {
            return firstPayload.text;
          }
        }

        // 旧格式
        if (lineJson.response && lineJson.response.text) {
          return lineJson.response.text;
        }
      } catch (e) {
        // 跳过非 JSON 行
      }
    }

    log('WARN', 'Could not extract text from response', { stdout: stdout.substring(0, 200) });
    return '';
  } catch (error) {
    log('ERROR', 'Failed to extract reply text', { error: error.message, stdout: stdout.substring(0, 200) });
    return '';
  }
}

// 生成唯一 ID
function generateId() {
  return `xiaoice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Verify SHA512 signature for XiaoIce webhook
function verifySignature(body, timestamp, signature, key) {
  // Validate timestamp to prevent replay attacks
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);

  if (isNaN(requestTime)) {
    log('WARN', 'Invalid timestamp format');
    return false;
  }

  if (Math.abs(now - requestTime) > XIAOICE_CONFIG.timestampWindow) {
    log('WARN', 'Request timestamp outside valid window');
    return false;
  }

  // Validate key matches XIAOICE_CONFIG.accessKey
  if (key !== XIAOICE_CONFIG.accessKey) {
    log('WARN', 'Authentication failed');
    return false;
  }

  // Compute SHA512: SHA512Hash(RequestBody+SecretKey+TimeStamp)
  const message = body + XIAOICE_CONFIG.secretKey + timestamp;
  const computed = crypto.createHash('sha512').update(message).digest('hex');

  // Use constant-time comparison to prevent timing attacks
  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(computed.toLowerCase()),
      Buffer.from(signature.toLowerCase())
    );

    if (isValid) {
      log('INFO', 'Signature verification passed');
    } else {
      log('WARN', 'Signature verification failed');
    }

    return isValid;
  } catch (error) {
    log('WARN', 'Signature comparison error');
    return false;
  }
}

// XiaoIce 对话处理器
async function handleXiaoIceDialogue(req, res) {
  log('INFO', `Webhook request: ${req.method} ${req.url}`);

  // 只接受 POST 请求
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // 检测是否为流式请求
  const isStreaming = req.headers['accept']?.includes('text/event-stream');

  // 读取请求体（带大小限制）
  let body = '';
  let bodySize = 0;

  req.on('data', chunk => {
    bodySize += chunk.length;
    if (bodySize > XIAOICE_CONFIG.maxBodySize) {
      log('WARN', 'Request body too large', { size: bodySize });
      req.destroy();
      return;
    }
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      // Extract authentication headers
      const timestamp = req.headers['x-xiaoice-timestamp'];
      const signature = req.headers['x-xiaoice-signature'];
      const key = req.headers['x-xiaoice-key'];

      // Optional authentication check
      if (XIAOICE_CONFIG.authRequired) {
        // Check all three headers exist
        if (!timestamp || !signature || !key) {
          log('WARN', 'Missing authentication headers');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        // Verify signature with raw body (before JSON parsing)
        if (!verifySignature(body, timestamp, signature, key)) {
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

      // 验证必需字段 - XiaoIce 格式
      if (!payload.askText || typeof payload.askText !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
        return;
      }

      // 提取 XiaoIce 请求字段（类型安全）
      const askText = String(payload.askText);
      const sessionId = String(payload.sessionId || '');
      const traceId = String(payload.traceId || '');
      const languageCode = String(payload.languageCode || 'zh');
      const extra = typeof payload.extra === 'object' && payload.extra !== null ? payload.extra : {};

      // 根据 isStreaming 选择响应模式
      try {
        if (isStreaming) {
          // 流式 SSE 响应
          log('INFO', 'Starting streaming response');

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          const result = await sendToOpenClaw({ sessionId, askText }, false);

          // 提取回复文本
          const fullReplyText = extractReplyText(result.response);

          // 应用语音优化
          const voiceOptimizedText = XIAOICE_CONFIG.voiceOptimization
            ? formatForVoice(fullReplyText)
            : fullReplyText;

          // 流式发送：只发送一次完整消息
          const event = {
            id: generateId(),
            traceId: traceId,
            sessionId: sessionId,
            askText: askText,
            replyText: voiceOptimizedText,
            replyType: 'Llm',
            timestamp: Date.now(),
            replyPayload: {},
            extra: { modelName: 'openclaw' }
          };

          res.write(`data: ${JSON.stringify(event)}\n\n`);

          // 发送结束标记
          res.write('data: [DONE]\n\n');
          res.end();

          log('INFO', 'Streaming response completed', {
            sessionId: sessionId,
            textLength: voiceOptimizedText.length,
            voiceOptimized: XIAOICE_CONFIG.voiceOptimization
          });

        } else {
          // 非流式 JSON 响应
          const result = await sendToOpenClaw({ sessionId, askText }, false);

          // 提取回复文本
          const replyText = extractReplyText(result.response);

          // 应用语音优化
          const voiceOptimizedText = XIAOICE_CONFIG.voiceOptimization
            ? formatForVoice(replyText)
            : replyText;

          // 返回 XiaoIce 期望的完整格式（非流式）
          const response = {
            id: generateId(),
            traceId: traceId,
            sessionId: sessionId,
            askText: askText,
            replyText: voiceOptimizedText,
            replyType: 'Llm',
            timestamp: Date.now(),
            replyPayload: {},
            extra: { modelName: 'openclaw' }
          };

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(response));

          log('INFO', 'Response sent successfully', {
            sessionId: sessionId,
            textLength: voiceOptimizedText.length,
            voiceOptimized: XIAOICE_CONFIG.voiceOptimization,
            response: response
          });
        }

      } catch (error) {
        log('ERROR', 'Processing error', { error: error.message });

        // 返回 XiaoIce 格式的错误响应
        const errorText = error.message === 'TIMEOUT' ? '请求超时，请稍后重试' : '处理请求时出错';
        const errorResponse = {
          id: generateId(),
          traceId: traceId,
          sessionId: sessionId,
          askText: askText,
          replyText: errorText,
          replyType: 'Fallback',
          timestamp: Date.now(),
          replyPayload: {},
          extra: { error: error.message }
        };

        // 检查是否已经发送了响应头（流式模式）
        if (isStreaming && res.headersSent) {
          // 流式模式下，发送错误事件并结束
          res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } else if (!res.headersSent) {
          // 非流式模式或还未发送头部
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(errorResponse));
        }
      }

    } catch (error) {
      log('ERROR', 'Request handling error', { error: error.message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
}

// 健康检查
function handleHealth(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    service: 'xiaoice-webhook-proxy',
    timestamp: Date.now()
  }));
}

// 路由
function router(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // 健康检查
  if (url.pathname === '/health') {
    return handleHealth(req, res);
  }
  
  // Webhook 端点
  if (url.pathname.startsWith('/webhooks/xiaoice')) {
    return handleXiaoIceDialogue(req, res);
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// 启动服务器
const server = http.createServer(router);

server.listen(PORT, () => {
  const authStatus = XIAOICE_CONFIG.authRequired ? 'ENABLED ✓' : 'DISABLED ⚠';
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         XiaoIce Webhook Proxy                           ║
╠═══════════════════════════════════════════════════════════╣
║  Webhook:  http://localhost:${PORT}/webhooks/xiaoice     ║
║  Health:   http://localhost:${PORT}/health               ║
║  Auth:     ${authStatus}                                  ║
╠═══════════════════════════════════════════════════════════╣
║  Next steps:                                            ║
║  1. Test: curl http://localhost:${PORT}/health          ║
║  2. Expose: ngrok http ${PORT}                          ║
║  3. Configure XiaoIce webhook URL                       ║
╚═══════════════════════════════════════════════════════════╝
  `);

  if (!XIAOICE_CONFIG.authRequired) {
    console.log('\x1b[33m%s\x1b[0m', '⚠ WARNING: Authentication is DISABLED');
    console.log('\x1b[33m%s\x1b[0m', '⚠ This should ONLY be used in development/testing');
    console.log('\x1b[33m%s\x1b[0m', '⚠ Set XIAOICE_AUTH_REQUIRED=true for production\n');
  }
});

// 优雅关闭
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  log('INFO', 'Shutting down...');
  server.close(() => {
    log('INFO', 'Server closed');
    process.exit(0);
  });
}
