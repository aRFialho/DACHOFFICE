import { Container, Graphics, Text } from "pixi.js";
import { officeArtTokens } from "../art/tokens.js";

export interface OfficeSpeechBubble {
  readonly severity: "NORMAL" | "CRITICAL";
  readonly text: string;
}

export const createSpeechBubble = ({
  severity,
  text,
}: OfficeSpeechBubble): Container => {
  const color =
    severity === "CRITICAL"
      ? officeArtTokens.palette.critical
      : officeArtTokens.palette.system;
  const copy = new Text({
    style: {
      fill: officeArtTokens.palette.ink,
      fontFamily: "monospace",
      fontSize: 10,
      wordWrap: true,
      wordWrapWidth: 124,
    },
    text,
  });
  copy.position.set(8, 6);

  const estimatedCharactersPerLine = 20;
  const lineCount = Math.max(
    1,
    Math.ceil(text.length / estimatedCharactersPerLine),
  );
  const bubbleWidth = Math.min(
    140,
    Math.max(72, Math.min(text.length, estimatedCharactersPerLine) * 6 + 16),
  );
  const bubbleHeight = lineCount * 12 + 12;
  const background = new Graphics()
    .roundRect(0, 0, bubbleWidth, bubbleHeight, 6)
    .fill({ alpha: 0.94, color: officeArtTokens.palette.surface })
    .stroke({ alpha: 0.9, color, width: 1 });
  const bubble = new Container({ label: `local-fixture-speech-${severity}` });

  bubble.addChild(background, copy);
  return bubble;
};
