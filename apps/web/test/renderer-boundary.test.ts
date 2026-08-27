import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rendererDirectory = resolve(
  import.meta.dirname,
  "../src/office/renderer",
);

const rendererSource = (): string =>
  readdirSync(rendererDirectory)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => readFileSync(resolve(rendererDirectory, file), "utf8"))
    .join("\n");

describe("Office renderer boundary", () => {
  it("does not import backend, provider, database or live transport concerns", () => {
    const source = rendererSource();

    expect(source).not.toMatch(
      /apps\/api|apps\/worker|database|neon|marketplace|fetch\(|EventSource/i,
    );
  });
});
