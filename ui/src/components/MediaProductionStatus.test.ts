import { expect, it } from "vitest";
import type { MediaProject } from "@/api/media-studio";
import { mediaProjectRefetchInterval } from "./MediaProductionStatus";

const jobs = (...statuses: Array<"queued" | "running" | "done" | "failed">) =>
  ({ jobs: statuses.map((status, index) => ({ id: String(index), projectId: "p", kind: "render" as const, status, error: null, outputAssetId: null })) }) as Pick<MediaProject, "jobs">;

it("polls only while a job is queued or running", () => {
  expect(mediaProjectRefetchInterval(undefined)).toBe(false);
  expect(mediaProjectRefetchInterval(jobs("done", "failed"))).toBe(false);
  expect(mediaProjectRefetchInterval(jobs("done", "queued"))).toBe(3000);
  expect(mediaProjectRefetchInterval(jobs("running"))).toBe(3000);
});
