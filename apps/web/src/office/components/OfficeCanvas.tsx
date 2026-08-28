import { useEffect, useMemo, useRef, useState } from "react";
import officePrototypeMap from "../maps/office-prototype.tiled.json" with { type: "json" };
import {
  officeVisualScenarioIds,
  type OfficeVisualScenarioId,
} from "../renderer/office-visual-scenario.js";
import { OfficeScene } from "../renderer/office-scene.js";
import { createOfficeSceneModel } from "../renderer/office-scene-model.js";
import { createOfficeRuntimeSceneState } from "../runtime/office-runtime-visual-state.js";
import type { OfficeRuntimeProjection } from "../runtime/office-runtime-projection.js";

export interface OfficeCanvasProps {
  readonly debug?: boolean;
  readonly runtimeProjection?: OfficeRuntimeProjection;
}

type OfficeCanvasStatus = "error" | "loading" | "ready";

const statusCopy: Record<OfficeCanvasStatus, string> = {
  error: "The local visual renderer could not start.",
  loading: "Preparing the local visual renderer.",
  ready:
    "Local visual Office renderer. No live operational state is shown in this preview.",
};

export const officeFixtureScenarioFromSearch = (
  search: string,
): OfficeVisualScenarioId | undefined => {
  const fixtureId = new URLSearchParams(search).get("officeFixture");

  return officeVisualScenarioIds.find((scenarioId) => scenarioId === fixtureId);
};

export const OfficeCanvas = ({
  debug = false,
  runtimeProjection,
}: OfficeCanvasProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<OfficeCanvasStatus>("loading");
  const runtimeSceneState = useMemo(() => {
    if (runtimeProjection === undefined) return undefined;
    const model = createOfficeSceneModel(officePrototypeMap);
    return createOfficeRuntimeSceneState(
      runtimeProjection,
      new Set(model.destinations.map((destination) => destination.id)),
      "FINANCE_DESK_ARTHUR",
    );
  }, [runtimeProjection]);

  useEffect(() => {
    const host = hostRef.current;
    let scene: OfficeScene | undefined;
    let disposed = false;

    if (host === null) {
      return;
    }

    const scenarioId =
      import.meta.env.DEV && typeof window !== "undefined"
        ? officeFixtureScenarioFromSearch(window.location.search)
        : undefined;
    const sceneOptions =
      runtimeSceneState !== undefined
        ? {
            debug,
            mapSource: officePrototypeMap,
            runtimeState: runtimeSceneState,
          }
        : scenarioId === undefined
          ? { debug, mapSource: officePrototypeMap }
          : { debug, mapSource: officePrototypeMap, scenarioId };

    void OfficeScene.mount(host, sceneOptions)
      .then((mountedScene) => {
        if (disposed) {
          mountedScene.destroy();
          return;
        }

        scene = mountedScene;
        setStatus("ready");
      })
      .catch(() => {
        if (!disposed) {
          setStatus("error");
        }
      });

    return () => {
      disposed = true;
      scene?.destroy();
    };
  }, [debug, runtimeSceneState]);

  return (
    <section className="office-canvas" aria-labelledby="office-canvas-title">
      <div>
        <p className="eyebrow">PIXELS / LOCAL FIXTURE</p>
        <h2 id="office-canvas-title">Office renderer foundation</h2>
      </div>
      <div
        aria-describedby="office-canvas-status"
        aria-label="Local visual Office renderer"
        className="office-canvas__host"
        ref={hostRef}
        role="img"
      />
      <p className="office-canvas__description">
        {runtimeProjection === undefined
          ? "Local fixture scenarios only; no live meeting, incident, workforce, task, or action data is shown."
          : "Authoritative semantic Office projection. The scene does not create business state or external actions."}
      </p>
      <p className="office-canvas__description">
        No live operational state is shown in this preview.
      </p>
      <p
        className="office-canvas__status"
        id="office-canvas-status"
        aria-live="polite"
      >
        {statusCopy[status]}
      </p>
    </section>
  );
};
