import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("App", () => {
  it("mounts the Office renderer inside the React control plane", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Office control plane");
    expect(markup).toContain("Local visual Office renderer");
    expect(markup).toContain("No authoritative task data is currently loaded.");
    expect(markup).toContain(
      "Set VITE_OFFICE_ID to connect the authoritative runtime projection.",
    );
  });
});
