# Secret Rotation Checklist

Use this checklist immediately after removing secrets from tracked files.

## Rotate now

1. XiaoIce `apiKey`
2. XiaoIce `webhookSecret`
3. OpenClaw gateway token
4. Feishu `appSecret`
5. Feishu `verificationToken`
6. Third-party model provider API keys
7. Any MCP credentials stored in local config paths

## Validate after rotation

1. Update local runtime env or secret store with new values.
2. Restart webhook and dependent services.
3. Verify `GET /health` returns `200`.
4. Verify one non-streaming and one streaming XiaoIce request succeed.
5. Confirm old credentials are rejected.

## Repo hygiene

1. Keep `openclaw.json` local only.
2. Use `openclaw.example.json` as the shared template.
3. Never paste live secrets into docs, issues, or commits.
