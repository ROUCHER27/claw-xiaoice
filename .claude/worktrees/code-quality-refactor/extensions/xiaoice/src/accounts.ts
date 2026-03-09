import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";

export type XiaoiceCredentialSource = "inline" | "none";

export type ResolvedXiaoiceAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  config: XiaoiceAccountConfig;
  credentialSource: XiaoiceCredentialSource;
};

export type XiaoiceAccountConfig = {
  apiBaseUrl?: string;
  apiKey?: string;
  webhookSecret?: string;
};

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = cfg.channels?.["xiaoice"]?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

export function listXiaoiceAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultXiaoiceAccountId(cfg: OpenClawConfig): string {
  const ids = listXiaoiceAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): XiaoiceAccountConfig {
  const channel = cfg.channels?.["xiaoice"];
  const accounts = channel?.accounts;
  
  if (accounts && typeof accounts === "object" && accountId in accounts) {
    const account = accounts[accountId];
    return {
      apiBaseUrl: (account as any)?.apiBaseUrl,
      apiKey: (account as any)?.apiKey,
      webhookSecret: (account as any)?.webhookSecret,
    };
  }
  
  return {
    apiBaseUrl: (channel as any)?.apiBaseUrl,
    apiKey: (channel as any)?.apiKey,
    webhookSecret: (channel as any)?.webhookSecret,
  };
}

export function resolveXiaoiceAccount({
  cfg,
  accountId,
}: {
  cfg: OpenClawConfig;
  accountId?: string;
}): ResolvedXiaoiceAccount {
  const id = accountId ?? resolveDefaultXiaoiceAccountId(cfg);
  const config = resolveAccountConfig(cfg, id);
  
  const channel = cfg.channels?.["xiaoice"];
  const accounts = channel?.accounts;
  const account = accounts?.[id] ?? channel;
  
  const enabled = (account as any)?.enabled ?? true;
  const hasCredentials = !!(config.apiBaseUrl && config.apiKey);
  
  return {
    accountId: id,
    name: (account as any)?.name,
    enabled,
    config,
    credentialSource: hasCredentials ? "inline" : "none",
  };
}
