export interface OfficeControlPanelProps {
  readonly eyebrow: string;
  readonly emptyMessage: string;
  readonly id: string;
  readonly title: string;
}

export const OfficeControlPanel = ({
  eyebrow,
  emptyMessage,
  id,
  title,
}: OfficeControlPanelProps) => (
  <section className="office-control-panel" aria-labelledby={id}>
    <p className="office-control-panel__eyebrow">{eyebrow}</p>
    <h2 id={id}>{title}</h2>
    <p className="office-control-panel__empty">{emptyMessage}</p>
  </section>
);
