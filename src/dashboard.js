/**
 * Local Dashboard Module
 * Provides browser-based status panel and log viewer for localhost only.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');

const LOG_FILE = path.join(process.cwd(), 'webhook.log');
const MAX_LOG_LINES = 1000;

function isLocalRequest(req) {
  const addr = req.socket.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function checkPort(host, port, timeout = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
    socket.connect(port, host);
  });
}

function queryNgrok() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:4040/api/tunnels', { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const tunnels = Array.isArray(json.tunnels) ? json.tunnels : [];
          const httpsTunnel = tunnels.find((t) => typeof t.public_url === 'string' && t.public_url.startsWith('https://'));
          resolve({
            running: true,
            publicUrl: httpsTunnel ? httpsTunnel.public_url : '',
            tunnelCount: tunnels.length
          });
        } catch (error) {
          resolve({ running: false, publicUrl: '', tunnelCount: 0 });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ running: false, publicUrl: '', tunnelCount: 0 });
    });
    req.on('error', () => resolve({ running: false, publicUrl: '', tunnelCount: 0 }));
  });
}

function readLastLogLines(lines = 120) {
  const safeLines = Math.max(1, Math.min(MAX_LOG_LINES, lines));
  if (!fs.existsSync(LOG_FILE)) return '';

  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const allLines = content.split('\n');
    return allLines.slice(-safeLines).join('\n');
  } catch (error) {
    return `Failed to read logs: ${error.message}`;
  }
}

function handleDashboardPage(req, res) {
  if (!isLocalRequest(req)) {
    sendText(res, 403, 'Forbidden: dashboard is localhost-only');
    return;
  }

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>XiaoIce Webhook Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #111827;
      --line: #1f2937;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --ok: #10b981;
      --warn: #f59e0b;
      --bad: #ef4444;
      --blue: #3b82f6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(1200px 500px at 20% -10%, #1e293b, var(--bg));
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { margin: 0 0 12px; font-size: 22px; }
    .muted { color: var(--muted); font-size: 13px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .card {
      border: 1px solid var(--line);
      background: rgba(17, 24, 39, 0.88);
      border-radius: 12px;
      padding: 12px;
    }
    .label { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
    .value { font-size: 18px; word-break: break-all; }
    .ok { color: var(--ok); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    .actions { margin: 14px 0; display: flex; gap: 8px; flex-wrap: wrap; }
    button {
      border: 1px solid #334155;
      background: #0b1220;
      color: var(--text);
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
    }
    .logbox {
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #020617;
      padding: 12px;
      min-height: 360px;
      max-height: 70vh;
      overflow: auto;
      white-space: pre-wrap;
      line-height: 1.35;
      font-size: 12px;
    }
    a { color: var(--blue); text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>XiaoIce Webhook Dashboard</h1>
    <div class="muted">Local-only panel. Auto refresh: status 2s, logs 3s.</div>
    <div class="grid">
      <div class="card"><div class="label">Service</div><div class="value" id="service">-</div></div>
      <div class="card"><div class="label">PID</div><div class="value" id="pid">-</div></div>
      <div class="card"><div class="label">Auth Required</div><div class="value" id="auth">-</div></div>
      <div class="card"><div class="label">OpenClaw Gateway</div><div class="value" id="gateway">-</div></div>
      <div class="card"><div class="label">Ngrok</div><div class="value" id="ngrok">-</div></div>
      <div class="card"><div class="label">Updated</div><div class="value" id="updated">-</div></div>
    </div>
    <div class="actions">
      <button onclick="refreshAll()">Refresh Now</button>
      <a href="/health" target="_blank">Open /health</a>
      <a href="http://localhost:4040" target="_blank">Open ngrok UI</a>
    </div>
    <div class="logbox" id="logs">Loading logs...</div>
  </div>
  <script>
    async function refreshStatus() {
      try {
        const res = await fetch('/api/dashboard/status');
        const data = await res.json();
        document.getElementById('service').textContent = data.serviceStatus ? 'RUNNING' : 'DOWN';
        document.getElementById('service').className = 'value ' + (data.serviceStatus ? 'ok' : 'bad');
        document.getElementById('pid').textContent = data.pid || '-';
        document.getElementById('auth').textContent = String(data.authRequired);
        document.getElementById('auth').className = 'value ' + (data.authRequired ? 'warn' : 'ok');
        document.getElementById('gateway').textContent = data.gatewayUp ? 'UP' : 'DOWN';
        document.getElementById('gateway').className = 'value ' + (data.gatewayUp ? 'ok' : 'warn');
        document.getElementById('ngrok').textContent = data.ngrok.running
          ? ('UP ' + (data.ngrok.publicUrl || ''))
          : 'DOWN';
        document.getElementById('ngrok').className = 'value ' + (data.ngrok.running ? 'ok' : 'warn');
        document.getElementById('updated').textContent = new Date(data.timestamp).toLocaleString();
      } catch (e) {
        document.getElementById('service').textContent = 'ERROR';
        document.getElementById('service').className = 'value bad';
      }
    }

    async function refreshLogs() {
      try {
        const res = await fetch('/api/dashboard/logs?lines=180');
        const text = await res.text();
        const box = document.getElementById('logs');
        box.textContent = text || '(empty logs)';
        box.scrollTop = box.scrollHeight;
      } catch (e) {
        document.getElementById('logs').textContent = 'Failed to load logs: ' + e.message;
      }
    }

    function refreshAll() {
      refreshStatus();
      refreshLogs();
    }

    refreshAll();
    setInterval(refreshStatus, 2000);
    setInterval(refreshLogs, 3000);
  </script>
</body>
</html>`;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function handleDashboardStatus(req, res, config) {
  if (!isLocalRequest(req)) {
    sendJson(res, 403, { error: 'Forbidden: dashboard API is localhost-only' });
    return;
  }

  const [gatewayUp, ngrok] = await Promise.all([
    checkPort('127.0.0.1', 18789),
    queryNgrok()
  ]);

  sendJson(res, 200, {
    service: 'xiaoice-webhook-proxy',
    serviceStatus: true,
    pid: process.pid,
    authRequired: !!config.authRequired,
    timeout: config.timeout,
    gatewayUp,
    ngrok,
    timestamp: Date.now()
  });
}

function handleDashboardLogs(req, res) {
  if (!isLocalRequest(req)) {
    sendText(res, 403, 'Forbidden: dashboard API is localhost-only');
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const lines = parseInt(url.searchParams.get('lines') || '120', 10);
  const text = readLastLogLines(Number.isNaN(lines) ? 120 : lines);
  sendText(res, 200, text);
}

module.exports = {
  handleDashboardPage,
  handleDashboardStatus,
  handleDashboardLogs
};
