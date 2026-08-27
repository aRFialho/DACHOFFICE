import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const controlDirectory = resolve(import.meta.dirname, "../src/office/control");

const controlSource = (): string =>
  readdirSync(controlDirectory)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => readFileSync(resolve(controlDirectory, file), "utf8"))
    .join("\n");

describe("Office control shell boundary", () => {
  it("does not access backend, provider, database or live transport concerns", () => {
    expect(controlSource()).not.toMatch(
      /apps\/api|apps\/worker|database|neon|marketplace|fetch\(|EventSource/i,
    );
  });
});
