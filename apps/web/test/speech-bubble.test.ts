import { describe, expect, it } from "vitest";
import { createSpeechBubble } from "../src/office/renderer/speech-bubble.js";

describe("fixture speech bubbles", () => {
  it("renders an overlay-only critical local fixture bubble", () => {
    const bubble = createSpeechBubble({
      severity: "CRITICAL",
      text: "Local critical-response fixture.",
    });

    expect(bubble.label).toBe("local-fixture-speech-CRITICAL");
    expect(bubble.children).toHaveLength(2);
  });
});
