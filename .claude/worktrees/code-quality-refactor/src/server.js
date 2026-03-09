/**
 * HTTP Server Module
 * Creates and manages the HTTP server with routing and graceful shutdown
 */

const http = require('http');
const { handleXiaoIceDialogue, handleHealthCheck } = require('./handlers');

/**
 * Create HTTP server with routing
 * @param {Object} config - Configuration object
 * @returns {Object} HTTP server instance
 */
function createServer(config) {
  const server = http.createServer((req, res) => {
    // Route: Health check
    if (req.url === '/health' && req.method === 'GET') {
      handleHealthCheck(req, res);
      return;
    }

    // Route: XiaoIce webhook
    if (req.url === '/webhooks/xiaoice' && req.method === 'POST') {
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

  server.listen(port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         XiaoIce Webhook Proxy                           ║
╠═══════════════════════════════════════════════════════════╣
║  Webhook:  http://localhost:${port}/webhooks/xiaoice     ║
║  Health:   http://localhost:${port}/health               ║
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
