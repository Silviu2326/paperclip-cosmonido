import { useState } from "react";
import { agentAppearanceSchema, isLpcAppearance, randomAgentAppearance, type LpcAgentAppearance } from "@paperclipai/shared";

/** Non-secret visual identity, retained across navigation and company changes. */
export function useAgentAppearanceDraft(draftKey: string) {
  const key = `paperclip.agent-appearance.${draftKey}`;
  function readDraft() {
    try {
      const stored = agentAppearanceSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? "null"));
      // Drafts from before pixel-art characters (cap-v1) are stale: new agents are always lpc-v1.
      if (stored.success && isLpcAppearance(stored.data)) return stored.data;
    } catch { /* Storage can be unavailable; retain the in-memory assignment. */ }
    const value = randomAgentAppearance();
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* In-memory draft still works. */ }
    return value;
  }
  const [draft, setDraft] = useState(() => ({ key, appearance: readDraft() }));
  if (draft.key !== key) setDraft({ key, appearance: readDraft() });
  function set(appearance: LpcAgentAppearance) {
    setDraft({ key, appearance });
    try { sessionStorage.setItem(key, JSON.stringify(appearance)); } catch { /* In-memory draft still works. */ }
  }
  return {
    appearance: draft.appearance,
    /** Replace the draft with an explicit choice (editor) and persist it for the session. */
    set,
    /** A fresh random pixel-art character. */
    reroll() { set(randomAgentAppearance()); },
    clear() { try { sessionStorage.removeItem(key); } catch { /* Best effort. */ } },
  };
}
