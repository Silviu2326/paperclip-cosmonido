# Native LLM providers: Anthropic and Gemini

Research checked 2026-10-22 against official vendor documentation.

## Anthropic

- Native Messages endpoint, `x-api-key`, and `anthropic-version: 2023-06-01`: https://docs.anthropic.com/en/api/messages
- Official current docs corroborate `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, and `claude-haiku-4-5`; they do **not** corroborate research/brief ids `claude-opus-5-5`, `claude-sonnet-5-5`, or `claude-haiku-5-5`. `claude-fable-5-1` also differs from the docs' alias `claude-fable-5`. These assignment-requested ids are retained for compatibility, but Haiku limits/pricing are intentionally unset.
- Current API deprecations say Opus 5 and Sonnet 5 exist, and later models use adaptive thinking. The current docs say temperature/top_p are rejected for Opus 4.7 and later at non-default values. Sampling is therefore omitted for the assignment's 5-family ids. https://docs.anthropic.com/en/docs/about-claude/model-deprecations and https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-templates-and-variables
- The current search result did not validate the research's 1M/128K capacities and exact Fable/Opus/Sonnet 5.5 prices; catalog values are provisional research values. Anthropic pricing page: https://docs.anthropic.com/en/docs/about-claude/pricing
- The API documents forced tool selection constraints by model family. Adapter passes requested choice; callers should prefer auto for latest Opus/Sonnet/Fable because some newest models reject forced selection.

## Gemini

- Official API confirms `x-goog-api-key`, native `generateContent`, `streamGenerateContent`, SSE, `systemInstruction`, `contents`, function calls/results, and usage token fields: https://ai.google.dev/api/generate-content and https://ai.google.dev/api
- Official docs corroborate `gemini-4-argon`, `gemini-3.8-flash`, and `gemini-2.5-flash-lite`; they do not corroborate `gemini-3.5-flash-lite`. Its price/limits are omitted. Gemini 4 Argon official page reports $2/$10 per MTok intro pricing through 2026-11-30, not the older research list: https://ai.google.dev/gemini-api/docs/generate-content/latest-model
- Google docs state 1M context and 65,536 streaming output cap for Gemini 4 Argon; Gemini 3/2.5 use 1M input and 65,536 output: https://ai.google.dev/gemini-api/docs/generate-content/tokens
- Schema conversion intentionally strips unrecognized JSON Schema keywords to the supported API subset. Gemini manual history must retain thought signatures for some tool loops; this provider-neutral contract has no signature field, so replaying Gemini 3 function-call history may be limited: https://ai.google.dev/gemini-api/docs/generate-content/function-calling

## Implementation assumptions

- `ProviderContext.credentials.apiKey` is supplied by the caller; provider modules do not read process environment directly.
- API key headers are always emitted; no URL query key is used.
- Provider-level JSON response format is not implemented for Anthropic native because the LLM contract's format shape lacks the vendor's exact schema constraints; Gemini maps it to `responseMimeType`/`responseSchema`.
- Price-based per-request cost estimates remain null pending audited pricing for each exact model id.
