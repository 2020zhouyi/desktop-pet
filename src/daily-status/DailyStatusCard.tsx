import { exportDailyStatusPng } from "./DailyStatusShareCanvas";
import { dailyStatusSkinForMenpai } from "./skins";
import type { DailyJianghuStatus } from "./types";
import type { CSSProperties } from "react";

type DailyStatusCardProps = {
  status: DailyJianghuStatus;
  onClose: () => void;
};

export function DailyStatusCard({ status, onClose }: DailyStatusCardProps) {
  const skin = dailyStatusSkinForMenpai(status.menpai);
  const style = {
    "--daily-primary": skin.colors.primary,
    "--daily-secondary": skin.colors.secondary,
    "--daily-accent": skin.colors.accent,
    "--daily-paper": skin.colors.paper,
    "--daily-ink": skin.colors.ink,
  } as CSSProperties;

  return (
    <article className="daily-status-card no-drag" style={style} aria-label="今日江湖状态">
      <DailyStatusMascot
        animalAnchor={status.animalAnchor}
        glyph={status.glyph}
        mascot={skin.mascot}
      />
      <header className="daily-status-header">
        <div>
          <p className="daily-status-menpai">{skin.displayName} · {status.animalAnchor}</p>
          <h2>{status.title}</h2>
        </div>
        <div className="daily-status-seal" aria-hidden="true">{skin.motifs[0]}</div>
      </header>

      <p className="daily-status-summary">{status.summary}</p>

      <div className="daily-status-metrics" aria-label="江湖状态参数">
        <DailyMetric label="动势" value={status.metrics.momentum} />
        <DailyMetric label="心气" value={status.metrics.heart} />
        <DailyMetric label="亲友缘" value={status.metrics.social} />
      </div>

      <div className="daily-status-chip-row">
        <span className="daily-status-chip-label">宜</span>
        {status.goodFor.map((item) => <span key={item} className="daily-status-chip">{item}</span>)}
      </div>
      <div className="daily-status-chip-row">
        <span className="daily-status-chip-label">避</span>
        {status.avoid.map((item) => <span key={item} className="daily-status-chip muted">{item}</span>)}
      </div>

      <p className="daily-status-line">{status.petLine}</p>

      <footer className="daily-status-actions">
        <button type="button" onClick={() => exportDailyStatusPng(status)}>截图</button>
        <button type="button" onClick={onClose}>关闭</button>
      </footer>
    </article>
  );
}

function DailyStatusMascot({
  animalAnchor,
  glyph,
  mascot,
}: {
  animalAnchor: string;
  glyph: string;
  mascot: string;
}) {
  return (
    <div
      className="daily-status-mascot"
      data-mascot={mascot}
      aria-label={`${animalAnchor}趴在今日江湖状态卡边缘`}
      title={animalAnchor}
    >
      <span className="mascot-tail" aria-hidden="true" />
      <span className="mascot-ear left" aria-hidden="true" />
      <span className="mascot-ear right" aria-hidden="true" />
      <span className="mascot-crest" aria-hidden="true" />
      <span className="mascot-wing" aria-hidden="true" />
      <span className="mascot-face">
        <span className="mascot-eye left" aria-hidden="true" />
        <span className="mascot-eye right" aria-hidden="true" />
        <span className="mascot-muzzle" aria-hidden="true" />
        <span className="mascot-beak" aria-hidden="true" />
        <span className="mascot-mark" aria-hidden="true">{glyph}</span>
      </span>
      <span className="mascot-paw left" aria-hidden="true" />
      <span className="mascot-paw right" aria-hidden="true" />
    </div>
  );
}

function DailyMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="daily-status-metric">
      <span>{label}</span>
      <meter min={0} max={100} value={value} aria-label={label} />
      <strong>{value}</strong>
    </div>
  );
}
