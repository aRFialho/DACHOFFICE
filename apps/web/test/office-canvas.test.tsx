import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfficeCanvas } from "../src/office/components/OfficeCanvas.js";

describe("OfficeCanvas", () => {
  it("provides an accessible non-live description alongside the canvas host", () => {
    const markup = renderToStaticMarkup(<OfficeCanvas />);

    expect(markup).toContain('role="img"');
    expect(markup).toContain("Local visual Office renderer");
    expect(markup).toContain(
      "No live operational state is shown in this preview.",
    );
  });
});
