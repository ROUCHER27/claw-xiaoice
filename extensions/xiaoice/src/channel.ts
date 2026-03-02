import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  getChatChannelMeta,
} from "openclaw/plugin-sdk";
import type { ChannelPlugin } from "openclaw/plugin-sdk";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import {
  listXiaoiceAccountIds,
  resolveXiaoiceAccount,
  resolveDefaultXiaoiceAccountId,
  type ResolvedXiaoiceAccount,
} from "./accounts.js";
import { sendXiaoiceMessage, sendXiaoiceMessageStream } from "./api.js";

const meta = getChatChannelMeta("xiaoice");

export const xiaoicePlugin: ChannelPlugin<ResolvedXiaoiceAccount> = {
  id: "xiaoice",
  meta: { ...meta },
  capabilities: {
    chatTypes: ["direct"],
  },
  configSchema: buildChannelConfigSchema({
    type: "object",
    properties: {
      apiBaseUrl: { type: "string" },
      apiKey: { type: "string" },
      webhookSecret: { type: "string" },
    },
  }),
  config: {
    listAccountIds: (cfg) => listXiaoiceAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveXiaoiceAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultXiaoiceAccountId(cfg),
    isConfigured: (account) => !!account.config.apiBaseUrl && !!account.config.apiKey,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: !!account.config.apiBaseUrl && !!account.config.apiKey,
      credentialSource: account.credentialSource,
    }),
  },
  // 流式相关配置
  streaming: {
    // 支持流式回复
    supported: true,
    // 构建流式上下文
    buildToolContext: ({ context }) => ({
      conversationId: context.To || "default",
    }),
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ cfg, accountId, text, to, stream }) => {
      const account = resolveXiaoiceAccount({ cfg, accountId });
      const conversationId = to || "default";
      
      // 如果需要流式返回
      if (stream) {
        const result = await sendXiaoiceMessageStream({
          account,
          conversationId,
          text,
          onChunk: async (event) => {
            // 将流式事件写入响应
            const data = `data: ${JSON.stringify(event)}\n\n`;
            await stream.writer.write(new TextEncoder().encode(data));
          },
        });
        
        if (!result.ok) {
          throw new Error(result.error);
        }
        
        return {
          channel: "xiaoice",
          messageId: `msg_${Date.now()}`,
          chatId: conversationId,
        };
      }
      
      // 普通非流式发送
      const result = await sendXiaoiceMessage({
        account,
        conversationId,
        text,
      });
      
      if (!result.ok) {
        throw new Error(result.error);
      }
      
      return {
        channel: "xiaoice",
        messageId: `msg_${Date.now()}`,
        chatId: conversationId,
      };
    },
  },
};
