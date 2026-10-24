# Auditoría de modelos de adaptadores — 2026-10-24

Complemento de `doc/adapter-model-audit-2026-10-02.md` (no lo sustituye).

## Cambios aplicados

- **Claude (`claude_local`)**: añadido `claude-haiku-5-5` ("Claude Haiku 5.5") a la lista `models`. Sin esfuerzos de razonamiento (`claudeLocalReasoningEffortsForModel` devuelve `[]`).
- **Cursor (`cursor-local`, fallback estático)**: añadidos `claude-opus-5`, `claude-sonnet-5-5` y `claude-haiku-5-5`.
- **OpenCode (`opencode-local`, fallback estático)**: añadidos `anthropic/claude-fable-5`, `anthropic/claude-haiku-5-5` y `anthropic/claude-opus-4-8`.
- **Tests**: `server/src/__tests__/adapter-models.test.ts` (Claude Haiku 5.5 y las listas de fallback de Cursor/OpenCode) y `packages/adapters/claude-local/src/index.test.ts` (Haiku 5.5 sin esfuerzos de razonamiento).

## Pendiente o no verificado

- **Bedrock**: la lista sigue sin Claude Haiku 5.5 ni Mythos 5. Los identificadores de Bedrock no se conocen, así que no se han inventado.
- **Mythos 5 (`claude-mythos-5`)**: los esfuerzos de razonamiento no están verificados; hoy caen en `low|medium|high`.
- **Codex, Gemini, Grok y Kimi**: sus listas no se han contrastado con los catálogos oficiales de cada proveedor. No se han tocado en esta fase.

## Verificación

- `packages/adapters/claude-local` (`src/index.test.ts`, `src/server/model-order.test.ts`): 24/24 pasan antes y después.
- `server/src/__tests__/adapter-models.test.ts`: 27/27 pasan antes y después.
- Sin fallos nuevos. Línea base en `C:/Users/usuario/AppData/Local/Temp/claude/c--Users-usuario-Downloads-infiniverse-mvp-v0-3-turn-engine-paperclip/8d0ab0d5-6263-4d5c-bf1d-52f9b97320ae/scratchpad/base_A0.txt`.
