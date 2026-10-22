import type { Db } from "@paperclipai/db";
import type { CommercialTriggerEvent, CommercialTriggerKind } from "@paperclipai/shared";

/** Sprint 3 WP6: routine origin kinds that commercial sequences create. WP1/routines must accept these. */
export const COMMERCIAL_ROUTINE_ORIGIN_KINDS = ["opportunity", "conversation", "commitment"] as const;
export type CommercialRoutineOriginKind = (typeof COMMERCIAL_ROUTINE_ORIGIN_KINDS)[number];

export const COMMERCIAL_TRIGGER_KINDS: readonly CommercialTriggerKind[] = [
  "no_reply",
  "meeting_held",
  "stage_changed",
  "lead_unattended",
  "commitment_due_soon",
];

export interface WaitingPlaybookRun {
  id: string;
  currentStepKind: string;
  nextActionAt: string | null;
}

export interface CommercialTriggerDeps {
  /** Playbook runs waiting on the subject (WP1 owns the runs). */
  findWaitingRuns: (companyId: string, subjectKind: CommercialTriggerEvent["subjectKind"], subjectId: string) => Promise<WaitingPlaybookRun[]>;
  advanceRun: (runId: string, reason: string) => Promise<void>;
  stopSequence: (runId: string, reason: string) => Promise<void>;
  /** Contact opt-out check (contacts.consents in Sprint 2). When true, every waiting sequence stops. */
  isUnsubscribed?: (companyId: string, subjectKind: CommercialTriggerEvent["subjectKind"], subjectId: string) => Promise<boolean>;
}

export interface CommercialTriggerResult {
  advanced: number;
  stopped: number;
}

/** A contact reply is a `stage_changed` event whose payload says `reason: "contact_replied"`. */
export function isContactReply(event: CommercialTriggerEvent): boolean {
  return event.kind === "stage_changed" && event.payload?.reason === "contact_replied";
}

export function commercialTriggers(db: Db, deps: CommercialTriggerDeps) {
  // `db` is kept for future lookups; the service writes nothing itself. Playbook state changes go through WP1's advanceRun/stopSequence.
  async function handle(event: CommercialTriggerEvent): Promise<CommercialTriggerResult> {
    const runs = await deps.findWaitingRuns(event.companyId, event.subjectKind, event.subjectId);
    if (runs.length === 0) return { advanced: 0, stopped: 0 };

    if (deps.isUnsubscribed && (await deps.isUnsubscribed(event.companyId, event.subjectKind, event.subjectId))) {
      for (const run of runs) await deps.stopSequence(run.id, "unsubscribed");
      return { advanced: 0, stopped: runs.length };
    }

    if (isContactReply(event)) {
      let stopped = 0;
      let advanced = 0;
      for (const run of runs) {
        if (run.currentStepKind === "follow_up") {
          await deps.stopSequence(run.id, "contact_replied");
          stopped += 1;
        } else {
          await deps.advanceRun(run.id, "contact_replied");
          advanced += 1;
        }
      }
      return { advanced, stopped };
    }

    for (const run of runs) await deps.advanceRun(run.id, event.kind);
    return { advanced: runs.length, stopped: 0 };
  }

  return { handle };
}

export type CommercialTriggers = ReturnType<typeof commercialTriggers>;
