import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@paperclipai/media-studio",
    environment: "node",
    include: ["test/**/*.test.ts"],
    maxWorkers: 1,
    testTimeout: 30_000,
  },
});
