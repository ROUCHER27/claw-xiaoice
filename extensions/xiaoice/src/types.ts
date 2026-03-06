export type XiaoiceCredentialSource = "inline" | "none";

export type XiaoiceAccountConfig = {
  apiBaseUrl?: string;
  apiKey?: string;
  webhookSecret?: string;
};

export type ResolvedXiaoiceAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  config: XiaoiceAccountConfig;
  credentialSource: XiaoiceCredentialSource;
};

export type XiaoiceMessage = {
  messageId: string;
  conversationId: string;
  userId: string;
  text: string;
  timestamp: number;
};

export type XiaoiceOutboundMessage = {
  conversationId: string;
  text: string;
};

export type WebhookPayload = {
  messageId: string;
  conversationId: string;
  userId: string;
  text: string;
  timestamp: number;
};

// SSE 流式消息格式
export type XiaoiceStreamEvent = {
  id: string;
  traceId?: string;
  sessionId?: string;
  askText: string;
  replyText: string;
  replyType: "FAQ" | "Doc" | "Llm" | "Fallback";
  timestamp: number;
  replyPayload?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  isFinal?: boolean;
};

// SSE 流式回调类型
export type XiaoiceStreamHandler = (event: XiaoiceStreamEvent) => void | Promise<void>;
