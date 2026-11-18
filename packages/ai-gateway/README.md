# `@spectre/ai-gateway`

In-process AI adapter. Until **O-002** is closed, only `SyntheticAIProvider` is allowed (**D-012**). No OpenAI SDK and no network calls.

## Public API

- `AI_JOB_STATUSES` / `AiJobStatus` — D-011 values only
- `AiGateway` / `SyntheticAIProvider.generateText`
- `AiGatewayError` with codes `AI_DATA_POLICY_BLOCKED`, `AI_TRANSFER_BLOCKED`, `VALIDATION_ERROR`
- `classifyUntrustedText` — server label for chat and posted text (`D3`)
- `assertTransferAllowed` — refuses an external mode. D3 and D4 stay refused even if another class is later allowed. Env `AI_PROVIDER` / `AI_EXECUTION_MODE` cannot open a network path.

## Policy

Chat and posted text are `D3`. The in-process synthetic adapter may run them. An external provider is refused before any network call, and the refusal does not include the text. `O-002` stays open.

```bash
pnpm --filter @spectre/ai-gateway test
```

Canonical product gateway spec: `docs/14-ai-provider-and-model-gateway.md`.
