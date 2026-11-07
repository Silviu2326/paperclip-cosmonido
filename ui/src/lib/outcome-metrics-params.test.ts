import { expect, it } from "vitest";
import { parseOutcomePath, parseOutcomePeriod } from "./outcome-metrics-params";

it("accepts only known paths and periods", () => {
  expect(parseOutcomePath("agency")).toBe("agency");
  expect(parseOutcomePath("admin")).toBeNull();
  expect(parseOutcomePath(null)).toBeNull();
  expect(parseOutcomePeriod("90")).toBe(90);
  expect(parseOutcomePeriod("14")).toBeNull();
  expect(parseOutcomePeriod(null)).toBeNull();
});
