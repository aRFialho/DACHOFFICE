import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfficeControlShell } from "../src/office/control/OfficeControlShell.js";

describe("OfficeControlShell", () => {
  it("renders React-readable disconnected states around the supplementary canvas", () => {
    const markup = renderToStaticMarkup(<OfficeControlShell />);

    expect(markup).toContain('aria-label="Office control plane"');
    expect(markup).toContain("Local visual Office renderer");
    expect(markup).toContain("No authoritative task data is currently loaded.");
    expect(markup).toContain("No approval data is currently loaded.");
    expect(markup).toContain("No conversation history is currently loaded.");
    expect(markup).toContain("Snapshot + SSE projection is not connected.");
  });
});
