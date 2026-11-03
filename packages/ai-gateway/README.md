# `@spectre/ai-gateway`

In-process AI adapter. Until **O-002** is closed, only `SyntheticAIProvider` is allowed (**D-012**). No OpenAI SDK and no network calls.

## Public API

- `AI_JOB_STATUSES` / `AiJobStatus` — D-011 values only
- `AiGateway` / `SyntheticAIProvider.generateText`
- `AiGatewayError` with codes such as `AI_DATA_POLICY_BLOCKED`, `VALIDATION_ERROR`

## Policy

`dataClass` must be `"synthetic"`. Any other class is refused.

```bash
pnpm --filter @spectre/ai-gateway test
```

Canonical product gateway spec: `docs/14-ai-provider-and-model-gateway.md`.
