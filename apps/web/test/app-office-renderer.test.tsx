import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("App", () => {
  it("mounts the Office renderer instead of only presenting the Finance desk asset", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Office renderer foundation");
    expect(markup).toContain("Local visual Office renderer");
  });
});
