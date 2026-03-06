import type { ResolvedXiaoiceAccount } from "./types.js";
import type { XiaoiceOutboundMessage, XiaoiceStreamEvent } from "./types.js";

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
}): Promise<{
  ok: boolean;
  error?: string;
  eventCount?: number;
  doneReceived?: boolean;
  completionReason?: "done-marker" | "is-final" | "eof";
}> {
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

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventCount = 0;
    let streamCompleted = false;
    let completionReason: "done-marker" | "is-final" | "eof" | undefined;

    const processEventBlock = async (rawBlock: string): Promise<void> => {
      const lines = rawBlock.split("\n");
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) {
        return;
      }

      const data = dataLines.join("\n").trim();
      if (!data) {
        return;
      }

      if (data === "[DONE]") {
        streamCompleted = true;
        completionReason = "done-marker";
        return;
      }

      try {
        const event = JSON.parse(data) as XiaoiceStreamEvent;
        eventCount += 1;
        if (onChunk) {
          await onChunk(event);
        }
        if (event.isFinal === true) {
          streamCompleted = true;
          completionReason = "is-final";
        }
      } catch (error) {
        // Ignore malformed SSE payloads from upstream.
      }
    };

    const drainBuffer = async (): Promise<void> => {
      let normalized = buffer.replace(/\r\n/g, "\n");
      let boundaryIndex = normalized.indexOf("\n\n");

      while (boundaryIndex !== -1) {
        const rawBlock = normalized.slice(0, boundaryIndex);
        normalized = normalized.slice(boundaryIndex + 2);
        await processEventBlock(rawBlock);
        boundaryIndex = normalized.indexOf("\n\n");
      }

      buffer = normalized;
    };

    while (!streamCompleted) {
      const { value, done } = await reader.read();
      if (done) {
        completionReason = completionReason || "eof";
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      await drainBuffer();
    }

    buffer += decoder.decode();
    await drainBuffer();

    try {
      await reader.cancel();
    } catch (error) {
      // Ignore reader cancel races.
    }

    return {
      ok: true,
      eventCount,
      doneReceived: streamCompleted,
      completionReason,
    };
  } catch (error) {
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}
