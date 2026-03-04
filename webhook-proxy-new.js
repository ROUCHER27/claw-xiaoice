#!/usr/bin/env node

/**
 * XiaoIce Webhook Proxy
 * Main entry point - delegates to modular components
 *
 * Usage:
 * 1. node webhook-proxy.js
 * 2. ngrok http 3002
 * 3. Configure XiaoIce Webhook URL to ngrok address
 */

const { startServer } = require('./src/server');

const PORT = process.env.PORT || 3002;

// XiaoIce Configuration - Load from environment or use defaults
const XIAOICE_CONFIG = {
  accessKey: process.env.XIAOICE_ACCESS_KEY || 'test-key',
  secretKey: process.env.XIAOICE_SECRET_KEY || 'test-secret',
  timeout: parseInt(process.env.XIAOICE_TIMEOUT || '18000', 10),
  maxBodySize: 10 * 1024 * 1024, // 10MB
  timestampWindow: 300000, // 5 minutes
  authRequired: process.env.XIAOICE_AUTH_REQUIRED !== 'false' // Default: enabled
};

// Start server
startServer(PORT, XIAOICE_CONFIG);
