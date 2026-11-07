import type { Sprint3ToolDefinition } from "./types.js";

const UUID_EXAMPLE = "00000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = { type: "string", minLength: 1, maxLength: 200 } as const;
const PROJECT_ID = { type: "string", format: "uuid" } as const;

/** Sprint 3 WP14 agent tools. Keep names in the `PRODUCT_TOOL_NAMES` list and the server dispatcher in sync. */
export const media_v3ToolDefinitions = [
  {
    name: "media_stop_motion",
    description: "Queue a stop motion video from an ordered list of same-company image assets (PNG, JPEG or WebP). Frame order is the array order. Camera motion is pan, zoom or none. Retry with the same idempotency key; poll media_get_job.",
    effect: "write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        frameAssetIds: { type: "array", items: { type: "string", format: "uuid" }, minItems: 1, maxItems: 200 },
        frameDurationSeconds: { type: "number", minimum: 0.05, maximum: 10 },
        cameraMotion: { type: "string", enum: ["pan", "zoom", "none"] },
        aspect: { type: "string", enum: ["9:16", "16:9"], default: "9:16" },
        primary: { type: "boolean", default: false },
        goalId: { type: "string", format: "uuid" },
      },
      required: ["projectId", "idempotencyKey", "frameAssetIds", "frameDurationSeconds", "cameraMotion"],
      additionalProperties: false,
    },
    example: {
      projectId: UUID_EXAMPLE,
      idempotencyKey: "demo-stop-motion-es",
      frameAssetIds: [UUID_EXAMPLE],
      frameDurationSeconds: 0.5,
      cameraMotion: "zoom",
      aspect: "9:16",
    },
  },
  {
    name: "media_dub_multivoice",
    description: "Queue speech for translated segments where each segment names its speaker and ElevenLabs voice. The caller supplies the translation; segments sharing a voiceId are synthesized together. Poll media_get_job.",
    effect: "write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        language: { type: "string", minLength: 2, maxLength: 35 },
        segments: {
          type: "array",
          minItems: 1,
          maxItems: 200,
          items: {
            type: "object",
            properties: {
              start: { type: "number", minimum: 0 },
              end: { type: "number", exclusiveMinimum: 0 },
              text: { type: "string", minLength: 1, maxLength: 5000 },
              speaker: { type: "string", minLength: 1, maxLength: 100 },
              voiceId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" },
            },
            required: ["start", "end", "text", "speaker", "voiceId"],
            additionalProperties: false,
          },
        },
        primary: { type: "boolean", default: false },
      },
      required: ["projectId", "idempotencyKey", "language", "segments"],
      additionalProperties: false,
    },
    example: {
      projectId: UUID_EXAMPLE,
      idempotencyKey: "demo-dub-multivoice-en",
      language: "en",
      segments: [{ start: 0, end: 2.5, text: "Hello, this is the demo.", speaker: "host", voiceId: "voice_host_en" }],
    },
  },
  {
    name: "media_voiceover",
    description: "Queue a voice track laid over a media project with the original audio ducked under the voice. Provide exactly one voice source: a script to synthesize (with voiceId) or an existing audio asset. Poll media_get_job.",
    effect: "write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        script: { type: "string", minLength: 1, maxLength: 5000 },
        voiceAssetId: { type: "string", format: "uuid" },
        voiceId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" },
        language: { type: "string", minLength: 2, maxLength: 35, default: "es" },
        duckingDb: { type: "number", minimum: -40, maximum: 0, default: -12 },
        primary: { type: "boolean", default: false },
      },
      required: ["projectId", "idempotencyKey"],
      additionalProperties: false,
      oneOf: [{ required: ["script", "voiceId"] }, { required: ["voiceAssetId"] }],
    },
    example: {
      projectId: UUID_EXAMPLE,
      idempotencyKey: "demo-voiceover-es",
      script: "Esta es tu demo personalizada.",
      voiceId: "voice_es_narrator",
      duckingDb: -12,
    },
  },
] as const satisfies readonly Sprint3ToolDefinition[];
