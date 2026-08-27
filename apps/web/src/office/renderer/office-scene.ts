import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  type Ticker,
} from "pixi.js";
import type { OfficeSceneLayerId } from "../art/index.js";
import type { OfficeAssetRegistry } from "./asset-registry.js";
import { createOfficeAssetRegistry } from "./asset-registry.js";
import { createFinanceAnalystAtlasTextures } from "./agent-atlas.js";
import { frameForAgentAnimation } from "./agent-animation-state.js";
import {
  createFixtureAgentRoute,
  positionForFixtureRoute,
} from "./fixture-agent-route.js";
import {
  defaultOfficeVisualScenarioId,
  resolveOfficeVisualScenario,
  type OfficeVisualScenarioId,
} from "./office-visual-scenario.js";
import {
  createOfficeSceneModel,
  type OfficeSceneModel,
} from "./office-scene-model.js";
import { projectOfficeNavigationRoute } from "./navigation-route-overlay.js";
import { createSpeechBubble } from "./speech-bubble.js";

const tileWidth = 64;
const tileHeight = 32;
const sceneOrigin = { x: 340, y: 104 };

export interface OfficeSceneOptions {
  readonly debug?: boolean;
  readonly mapSource: unknown;
  readonly scenarioId?: OfficeVisualScenarioId;
}

export class OfficeScene {
  private constructor(private readonly application: Application) {}

  static async mount(
    host: HTMLElement,
    options: OfficeSceneOptions,
  ): Promise<OfficeScene> {
    const application = new Application();
    await application.init({
      antialias: false,
      autoDensity: true,
      backgroundAlpha: 0,
      preference: "webgl",
      resizeTo: host,
      resolution: Math.min(window.devicePixelRatio, 2),
    });

    application.canvas.classList.add("office-canvas__view");
    application.canvas.setAttribute("aria-hidden", "true");
    host.append(application.canvas);

    const scene = new OfficeScene(application);
    await scene.render(options);
    return scene;
  }

  destroy(): void {
    this.application.destroy({ removeView: true }, { children: true });
  }

  private async render({
    debug = false,
    mapSource,
    scenarioId = defaultOfficeVisualScenarioId,
  }: OfficeSceneOptions): Promise<void> {
    const model = createOfficeSceneModel(mapSource);
    const layers = new Map<OfficeSceneLayerId, Container>();

    for (const layer of model.layers) {
      const container = new Container({ label: layer.id });
      layers.set(layer.id, container);
      this.application.stage.addChild(container);
    }

    this.drawFloor(layers.get("floor")!);
    this.drawRoomTint(layers.get("floor_decals")!);
    this.drawWalls(layers.get("walls_back")!, layers.get("walls_front")!);
    const registry = createOfficeAssetRegistry();
    await this.drawFurniture(layers.get("furniture_back")!, registry);
    await this.drawFixtureAgents(
      layers.get("dynamic")!,
      layers.get("overlays")!,
      model,
      scenarioId,
      registry,
    );

    if (debug) {
      const debugLayer = layers.get("debug")!;
      if (model.navigationRoute !== undefined) {
        this.drawNavigationRoute(debugLayer, model.navigationRoute.cells);
      }
      this.drawDebug(debugLayer, model.destinations);
    }
  }

  private drawFloor(layer: Container): void {
    const floor = new Graphics();

    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const x = sceneOrigin.x + (column - row) * (tileWidth / 2);
        const y = sceneOrigin.y + (column + row) * (tileHeight / 2);
        floor
          .poly([x, y, x + 32, y + 16, x, y + 32, x - 32, y + 16], true)
          .fill({ color: (row + column) % 2 === 0 ? 0x17334a : 0x112a40 });
      }
    }

    layer.addChild(floor);
  }

  private drawRoomTint(layer: Container): void {
    const tint = new Graphics()
      .poly([340, 126, 468, 190, 340, 254, 212, 190], true)
      .fill({ alpha: 0.18, color: 0x45bdb5 })
      .stroke({ alpha: 0.7, color: 0x67d9e8, width: 1 });

    layer.addChild(tint);
  }

  private drawWalls(backLayer: Container, frontLayer: Container): void {
    const backWall = new Graphics()
      .poly([212, 94, 340, 30, 468, 94, 468, 142, 340, 78, 212, 142], true)
      .fill({ color: 0x183149 })
      .stroke({ alpha: 0.6, color: 0x3e7892, width: 1 });
    const frontWall = new Graphics()
      .poly([212, 190, 340, 254, 468, 190, 468, 208, 340, 272, 212, 208], true)
      .fill({ alpha: 0.78, color: 0x0b1d2d });

    backLayer.addChild(backWall);
    frontLayer.addChild(frontWall);
  }

  private async drawFurniture(
    layer: Container,
    registry: OfficeAssetRegistry,
  ): Promise<void> {
    const deskAsset = registry.get("furniture.analyst_desk");

    if (deskAsset === undefined) {
      throw new Error("Finance desk asset is required for the Office scene");
    }

    const texture = await Assets.load({
      data: { scaleMode: "nearest" },
      src: deskAsset.src,
    });
    const desk = new Sprite(texture);
    desk.anchor.set(0.5, 1);
    desk.position.set(340, 202);
    desk.scale.set(0.17);
    desk.label = "finance-workstation";
    layer.addChild(desk);
  }

  private async drawFixtureAgents(
    dynamicLayer: Container,
    overlayLayer: Container,
    model: OfficeSceneModel,
    scenarioId: OfficeVisualScenarioId,
    registry: OfficeAssetRegistry,
  ): Promise<void> {
    const atlasAsset = registry.get("agent.finance_analyst");
    if (atlasAsset === undefined) {
      throw new Error("Finance analyst atlas is required");
    }

    const sourceTexture = await Assets.load({
      data: { scaleMode: "nearest" },
      src: atlasAsset.src,
    });
    const textures = createFinanceAnalystAtlasTextures(sourceTexture);
    const scenario = resolveOfficeVisualScenario(scenarioId);

    for (const fixture of scenario.agents) {
      const route = createFixtureAgentRoute({
        destinations: model.destinations,
        grid: model.navigationGrid,
        origin: sceneOrigin,
        startDestinationId: fixture.startDestinationId,
        targetDestinationId: fixture.destinationId,
        tileSize: { height: tileHeight, width: tileWidth },
      });
      const walkingFrame = frameForAgentAnimation({
        direction: fixture.animation.direction,
        state: "WALKING",
      });
      const arrivedFrame = frameForAgentAnimation(fixture.animation);
      const walkingTexture = textures.get(walkingFrame);
      const arrivedTexture = textures.get(arrivedFrame);

      if (walkingTexture === undefined || arrivedTexture === undefined) {
        throw new Error("Fixture animation frame is required");
      }

      const avatar = new Sprite(walkingTexture);
      avatar.anchor.set(0.5, 1);
      avatar.position.set(route.start.x, route.start.y);
      avatar.scale.set(0.8);
      avatar.label = `local-fixture-agent-${fixture.agentId}`;
      dynamicLayer.addChild(avatar);

      const speechBubble =
        fixture.speech === undefined
          ? undefined
          : createSpeechBubble(fixture.speech);
      if (speechBubble !== undefined) {
        speechBubble.position.set(route.start.x + 10, route.start.y - 70);
        overlayLayer.addChild(speechBubble);
      }

      let elapsedMs = 0;
      const durationMs = 700 + route.cells.length * 100;
      const advance = (ticker: Ticker): void => {
        elapsedMs = Math.min(durationMs, elapsedMs + ticker.deltaMS);
        const position = positionForFixtureRoute(route, elapsedMs / durationMs);
        avatar.position.set(position.x, position.y);
        speechBubble?.position.set(position.x + 10, position.y - 70);

        if (elapsedMs === durationMs) {
          avatar.texture = arrivedTexture;
          this.application.ticker.remove(advance);
        }
      };

      this.application.ticker.add(advance);
    }
  }

  private drawNavigationRoute(
    layer: Container,
    cells: readonly Readonly<{ column: number; row: number }>[],
  ): void {
    const points = projectOfficeNavigationRoute(cells, sceneOrigin, {
      height: tileHeight,
      width: tileWidth,
    });

    if (points.length < 2) {
      return;
    }

    const route = new Graphics().moveTo(points[0]!.x, points[0]!.y);
    for (const point of points.slice(1)) {
      route.lineTo(point.x, point.y);
    }
    route.stroke({ alpha: 0.9, color: 0x8bf3e4, width: 2 });
    route.label = "local-navigation-route";
    layer.addChild(route);
  }

  private drawDebug(
    layer: Container,
    destinations: readonly Readonly<{
      id: string;
      position: Readonly<{ x: number; y: number }>;
    }>[],
  ): void {
    for (const destination of destinations) {
      const marker = new Graphics()
        .circle(destination.position.x, destination.position.y, 5)
        .stroke({ color: 0xffc66d, width: 2 });
      const label = new Text({
        style: { fill: 0xffc66d, fontFamily: "monospace", fontSize: 10 },
        text: destination.id,
      });

      label.position.set(
        destination.position.x + 8,
        destination.position.y - 8,
      );
      layer.addChild(marker, label);
    }
  }
}
