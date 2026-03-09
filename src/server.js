/**
 * HTTP Server Module
 * Creates and manages the HTTP server with routing and graceful shutdown
 */

const http = require('http');
const { handleXiaoIceDialogue, handleHealthCheck } = require('./handlers');
const {
  handleDashboardPage,
  handleDashboardStatus,
  handleDashboardLogs
} = require('./dashboard');

/**
 * Create HTTP server with routing
 * @param {Object} config - Configuration object
 * @returns {Object} HTTP server instance
 */
function createServer(config) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    // Route: Health check
    if (url.pathname === '/health' && req.method === 'GET') {
      handleHealthCheck(req, res);
      return;
    }

    // Route: Local dashboard
    if (url.pathname === '/dashboard' && req.method === 'GET') {
      handleDashboardPage(req, res);
      return;
    }

    // Route: Dashboard status API
    if (url.pathname === '/api/dashboard/status' && req.method === 'GET') {
      handleDashboardStatus(req, res, config).catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      });
      return;
    }

    // Route: Dashboard logs API
    if (url.pathname === '/api/dashboard/logs' && req.method === 'GET') {
      handleDashboardLogs(req, res);
      return;
    }

    // Route: XiaoIce webhook
    if (url.pathname === '/webhooks/xiaoice' && req.method === 'POST') {
      handleXiaoIceDialogue(req, res, config);
      return;
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

/**
 * Start HTTP server with graceful shutdown
 * @param {number} port - Port to listen on
 * @param {Object} config - Configuration object
 * @returns {Object} Server instance
 */
function startServer(port, config) {
  const server = createServer(config);
  const headersTimeoutMs = Number.isFinite(config.headersTimeoutMs) && config.headersTimeoutMs > 0
    ? config.headersTimeoutMs
    : 15000;
  const requestTimeoutMs = Number.isFinite(config.requestTimeoutMs) && config.requestTimeoutMs > 0
    ? config.requestTimeoutMs
    : 45000;
  server.headersTimeout = headersTimeoutMs;
  server.requestTimeout = requestTimeoutMs;

  server.listen(port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         XiaoIce Webhook Proxy                           ║
╠═══════════════════════════════════════════════════════════╣
║  Webhook:  http://localhost:${port}/webhooks/xiaoice     ║
║  Health:   http://localhost:${port}/health               ║
║  Dashboard: http://localhost:${port}/dashboard           ║
║  Auth:     ${config.authRequired ? 'ENABLED ✓' : 'DISABLED ⚠'}                                  ║
╠═══════════════════════════════════════════════════════════╣
║  Next steps:                                            ║
║  1. Test: curl http://localhost:${port}/health          ║
║  2. Expose: ngrok http ${port}                          ║
║  3. Configure XiaoIce webhook URL                       ║
╚═══════════════════════════════════════════════════════════╝
    `);

    if (!config.authRequired) {
      console.log('\x1b[33m%s\x1b[0m', '⚠ WARNING: Authentication is DISABLED');
      console.log('\x1b[33m%s\x1b[0m', '⚠ This should ONLY be used in development/testing');
      console.log('\x1b[33m%s\x1b[0m', '⚠ Set XIAOICE_AUTH_REQUIRED=true for production\n');
    }
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

module.exports = {
  createServer,
  startServer
};
