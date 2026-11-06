import type { VoiceDescriptor, VoiceGender } from "../../core/types.js";

const voices: [string, VoiceGender, string[]][] = [
  ["alloy", "neutral", ["balanced"]], ["ash", "male", ["conversational"]],
  ["ballad", "male", ["expressive"]], ["coral", "female", ["warm"]],
  ["echo", "male", ["clear"]], ["fable", "neutral", ["storytelling"]],
  ["nova", "female", ["energetic"]], ["onyx", "male", ["deep"]],
  ["sage", "female", ["calm"]], ["shimmer", "female", ["bright"]],
  ["verse", "male", ["expressive"]], ["marin", "female", ["natural"]],
  ["cedar", "male", ["natural"]],
];

/** Static 2026 catalog; gender and descriptive labels are best-effort listening hints. */
export const OPENAI_VOICES: VoiceDescriptor[] = voices.map(([name, gender, tags]) => ({
  id: `openai:${name}`, provider: "openai", providerVoiceId: name, name,
  languages: [], gender, age: "unknown", tags, origin: "premade",
  models: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].includes(name)
    ? ["gpt-4o-mini-tts", "tts-1-hd", "tts-1"] : ["gpt-4o-mini-tts"],
}));
