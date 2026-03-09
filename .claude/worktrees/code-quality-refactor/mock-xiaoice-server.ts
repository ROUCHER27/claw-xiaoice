#!/usr/bin/env node

/**
 * Mock XiaoIce Server
 * 用于测试 OpenClaw xiaoice 插件
 * 
 * 启动: node mock-xiaoice-server.ts
 * 
 * 端点:
 * - POST /webhook - 接收 OpenClaw 发送的消息
 * - GET /health - 健康检查
 */

import http from "http";

const PORT = process.env.PORT || 39001;

// 存储收到的消息
const messages: any[] = [];

// Webhook 端点
function handleWebhook(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  
  req.on("data", chunk => {
    body += chunk.toString();
  });
  
  req.on("end", () => {
    try {
      const data = JSON.parse(body);
      messages.push(data);
      
      console.log(`[Webhook] Received:`, JSON.stringify(data, null, 2));
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error(`[Error]`, error);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
  });
}

// 健康检查
function handleHealth(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ 
    status: "ok",
    messages: messages.length 
  }));
}

// 路由
function router(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  
  if (url.pathname === "/webhook" && req.method === "POST") {
    return handleWebhook(req, res);
  }
  
  if (url.pathname === "/health") {
    return handleHealth(req, res);
  }
  
  if (url.pathname === "/messages") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(messages));
  }
  
  res.writeHead(404);
  res.end("Not found");
}

// 启动服务器
const server = http.createServer(router);

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Mock XiaoIce Server                           ║
╠═══════════════════════════════════════════════════════════╣
║  Webhook:  http://localhost:${PORT}/webhook              ║
║  Health:   http://localhost:${PORT}/health               ║
║  Messages: http://localhost:${PORT}/messages             ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// 处理关闭
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
