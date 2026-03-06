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

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// XiaoIce Configuration - Load from environment or use defaults
const XIAOICE_CONFIG = {
  accessKey: process.env.XIAOICE_ACCESS_KEY || 'test-key',
  secretKey: process.env.XIAOICE_SECRET_KEY || 'test-secret',
  timeout: parsePositiveInt(process.env.XIAOICE_TIMEOUT, 30000),
  maxBodySize: 10 * 1024 * 1024, // 10MB
  timestampWindow: 300000, // 5 minutes
  authRequired: process.env.XIAOICE_AUTH_REQUIRED === 'true', // Default: disabled for dev/testing
  sessionQueueLimit: parsePositiveInt(process.env.XIAOICE_SESSION_QUEUE_LIMIT, 20),
  sseHeartbeatMs: parseNonNegativeInt(process.env.XIAOICE_SSE_HEARTBEAT_MS, 0),
  headersTimeoutMs: parsePositiveInt(process.env.XIAOICE_HEADERS_TIMEOUT_MS, 15000),
  requestTimeoutMs: parsePositiveInt(process.env.XIAOICE_REQUEST_TIMEOUT_MS, 45000)
};

// Start server
startServer(PORT, XIAOICE_CONFIG);
