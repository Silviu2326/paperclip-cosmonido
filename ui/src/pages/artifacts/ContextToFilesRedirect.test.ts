import { describe, expect, it } from "vitest";
import { contextRedirectSearch } from "./ContextToFilesRedirect";

describe("contextRedirectSearch", () => {
  it("turns the retired Context URL into the explorer's context view", () => {
    expect(contextRedirectSearch("")).toBe("?context=1");
  });

  it("keeps the project link's projectId so the project's audience stays selected", () => {
    expect(contextRedirectSearch("?projectId=project-1")).toBe("?projectId=project-1&context=1");
  });
});
