import { Rectangle, Texture } from "pixi.js";
import { requiredAgentAtlasFrames } from "../art/asset-contract.js";

export interface OfficeAgentAtlasFrameMetadata {
  readonly name: (typeof requiredAgentAtlasFrames)[number];
  readonly rect: Readonly<{
    height: number;
    width: number;
    x: number;
    y: number;
  }>;
}

export interface OfficeAgentAtlasMetadata {
  readonly frameHeight: number;
  readonly frameWidth: number;
  readonly frames: readonly OfficeAgentAtlasFrameMetadata[];
  readonly sourceAssetId: "agent.finance_analyst";
}

const frameWidth = 64;
const frameHeight = 80;
const columns = 7;

export const financeAnalystAtlasMetadata: OfficeAgentAtlasMetadata = {
  frameHeight,
  frameWidth,
  frames: requiredAgentAtlasFrames.map((name, index) => ({
    name,
    rect: {
      height: frameHeight,
      width: frameWidth,
      x: (index % columns) * frameWidth,
      y: Math.floor(index / columns) * frameHeight,
    },
  })),
  sourceAssetId: "agent.finance_analyst",
};

export const createFinanceAnalystAtlasTextures = (
  sourceTexture: Texture,
): ReadonlyMap<(typeof requiredAgentAtlasFrames)[number], Texture> =>
  new Map(
    financeAnalystAtlasMetadata.frames.map((frame) => [
      frame.name,
      new Texture({
        frame: new Rectangle(
          frame.rect.x,
          frame.rect.y,
          frame.rect.width,
          frame.rect.height,
        ),
        source: sourceTexture.source,
      }),
    ]),
  );
