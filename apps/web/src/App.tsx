import {
  officeAssetCatalog,
  officeAssetCategories,
  officeDepartmentPalette,
  officeSceneLayers,
  officeZones,
} from "./office/art/index.js";
import { OfficeCanvas } from "./office/components/OfficeCanvas.js";

const categoryLabels = {
  floor: "Floors",
  wall: "Walls",
  furniture: "Furniture",
  room: "Rooms",
  agent: "Agents",
  effect: "Effects",
  branding: "Branding",
  scene_ui: "Scene UI",
} as const;

export const App = () => (
  <main className="art-page" id="main-content">
    <a className="skip-link" href="#art-system">
      Pular para o sistema de arte
    </a>
    <header className="art-hero">
      <div>
        <p className="eyebrow">DACHBYTE OFFICE / FRONTEND PROGRAM</p>
        <h1>Office Art System</h1>
        <p className="hero-copy">
          A fundacao visual para um escritorio isometrico vivo: construida por
          camadas, assets independentes e destinos semanticos — nunca por uma
          screenshot de fundo.
        </p>
      </div>
      <aside className="sprint-badge" aria-label="Sprint ativa">
        <span>ACTIVE</span>
        <strong>14B</strong>
        <small>PixiJS + Tiled Renderer</small>
      </aside>
    </header>

    <section className="art-overview" aria-label="Princípios da cena">
      <article className="principle-card principle-card--cyan">
        <span className="principle-number">01</span>
        <h2>Semantic first</h2>
        <p>
          O backend descreve estados e destinos. O mapa futuro decide a posicao,
          sem receber regras de negocio.
        </p>
      </article>
      <article className="principle-card principle-card--amber">
        <span className="principle-number">02</span>
        <h2>Modular by design</h2>
        <p>
          Piso, parede, mobiliario, avatar e efeito sao unidades reutilizaveis
          com contratos proprios.
        </p>
      </article>
      <article className="principle-card principle-card--violet">
        <span className="principle-number">03</span>
        <h2>React remains usable</h2>
        <p>
          Painel, navegacao e detalhes operacionais continuarao acessiveis sem
          depender do canvas.
        </p>
      </article>
    </section>

    <OfficeCanvas />

    <section className="art-system" id="art-system" aria-labelledby="art-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ART BIBLE / BASE GRID</p>
          <h2 id="art-title">A grammar for the Office</h2>
        </div>
        <p>Isometric 2:1 · 64 × 32 logical tiles · depth-sorted scene layers</p>
      </div>

      <div className="layer-panel" aria-label="Ordem de camadas da cena">
        {officeSceneLayers.map((layer) => (
          <div className="layer-row" key={layer.id}>
            <span>{String(layer.order).padStart(2, "0")}</span>
            <strong>{layer.label}</strong>
            <code>{layer.id}</code>
          </div>
        ))}
      </div>
    </section>

    <section className="catalogue" aria-labelledby="catalogue-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">INDEPENDENT ELEMENTS</p>
          <h2 id="catalogue-title">Asset catalogue</h2>
        </div>
        <p>
          {officeAssetCatalog.length} modular definitions ready for the
          renderer.
        </p>
      </div>
      <div className="catalogue-grid">
        {officeAssetCategories.map((category) => {
          const assets = officeAssetCatalog.filter(
            (asset) => asset.category === category,
          );
          return (
            <article className="asset-card" key={category}>
              <div className="asset-card__diamond" aria-hidden="true" />
              <div>
                <p className="asset-card__type">{category}</p>
                <h3>{categoryLabels[category]}</h3>
                <ul>
                  {assets.map((asset) => (
                    <li key={asset.id}>{asset.label}</li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </section>

    <section className="zones" aria-labelledby="zones-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SEMANTIC LAYOUT</p>
          <h2 id="zones-title">Rooms are identifiers, not coordinates</h2>
        </div>
        <p>Physical placement belongs to Tiled in Sprint 14B.</p>
      </div>
      <ul className="zone-list">
        {officeZones.map((zone) => (
          <li key={zone.id}>
            <span
              aria-hidden="true"
              className="zone-swatch"
              style={{
                backgroundColor:
                  officeDepartmentPalette[
                    zone.id.toLowerCase() as keyof typeof officeDepartmentPalette
                  ] ?? "#67d9e8",
              }}
            />
            <div>
              <strong>{zone.label}</strong>
              <small>{zone.department}</small>
            </div>
            <code>{zone.id}</code>
          </li>
        ))}
      </ul>
    </section>

    <footer className="art-footer">
      <p>
        Current scope: visual contracts and design direction. PixiJS, Tiled,
        movement and live snapshot/SSE synchronization arrive in the next
        frontend slices.
      </p>
    </footer>
  </main>
);
