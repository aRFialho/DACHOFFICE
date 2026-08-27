import { useEffect, useRef, useState } from "react";
import officePrototypeMap from "../maps/office-prototype.tiled.json" with { type: "json" };
import { OfficeScene } from "../renderer/office-scene.js";

export interface OfficeCanvasProps {
  readonly debug?: boolean;
}

type OfficeCanvasStatus = "error" | "loading" | "ready";

const statusCopy: Record<OfficeCanvasStatus, string> = {
  error: "The local visual renderer could not start.",
  loading: "Preparing the local visual renderer.",
  ready:
    "Local visual Office renderer. No live operational state is shown in this preview.",
};

export const OfficeCanvas = ({ debug = false }: OfficeCanvasProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<OfficeCanvasStatus>("loading");

  useEffect(() => {
    const host = hostRef.current;
    let scene: OfficeScene | undefined;
    let disposed = false;

    if (host === null) {
      return;
    }

    void OfficeScene.mount(host, { debug, mapSource: officePrototypeMap })
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
  }, [debug]);

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
