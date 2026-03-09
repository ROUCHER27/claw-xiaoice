import type { ResolvedXiaoiceAccount } from "./types.js";
import type { XiaoiceOutboundMessage, XiaoiceStreamEvent, XiaoiceStreamHandler } from "./types.js";

/**
 * 发送消息（非流式）
 */
export async function sendXiaoiceMessage({
  account,
  conversationId,
  text,
}: {
  account: ResolvedXiaoiceAccount;
  conversationId: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { config } = account;
  
  if (!config.apiBaseUrl || !config.apiKey) {
    return { ok: false, error: "Missing apiBaseUrl or apiKey" };
  }
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        conversationId,
        text,
      } as XiaoiceOutboundMessage),
    });
    
    if (!response.ok) {
      return { 
        ok: false, 
        error: `HTTP ${response.status}: ${response.statusText}` 
      };
    }
    
    return { ok: true };
  } catch (error) {
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * 发送消息（流式 SSE）
 * 返回 ReadableStream 用于流式处理
 */
export async function sendXiaoiceMessageStream({
  account,
  conversationId,
  text,
  onChunk,
}: {
  account: ResolvedXiaoiceAccount;
  conversationId: string;
  text: string;
  onChunk?: (event: XiaoiceStreamEvent) => void | Promise<void>;
}): Promise<{ ok: boolean; error?: string; stream?: ReadableStream<Uint8Array> }> {
  const { config } = account;
  
  if (!config.apiBaseUrl || !config.apiKey) {
    return { ok: false, error: "Missing apiBaseUrl or apiKey" };
  }
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/send/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        conversationId,
        text,
      } as XiaoiceOutboundMessage),
    });
    
    if (!response.ok) {
      return { 
        ok: false, 
        error: `HTTP ${response.status}: ${response.statusText}` 
      };
    }
    
    const stream = response.body;
    
    if (!stream) {
      return { ok: false, error: "No stream returned" };
    }
    
    // 创建转换流处理 SSE
    const transformer = new TransformStream<Uint8Array, XiaoiceStreamEvent>({
      transform(chunk, controller) {
        const decoder = new TextDecoder();
        const text = decoder.decode(chunk, { stream: true });
        
        // 解析 SSE 格式
        // data: {"id":"...","replyText":"..."}
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data && data !== "[DONE]") {
              try {
                const event = JSON.parse(data) as XiaoiceStreamEvent;
                // 调用回调
                if (onChunk) {
                  onChunk(event);
                }
                controller.enqueue(event);
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      },
    });
    
    return { 
      ok: true, 
      stream: stream.pipeThrough(transformer) 
    };
  } catch (error) {
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}
