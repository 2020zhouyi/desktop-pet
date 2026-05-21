import { exportDailyStatusPng } from "./DailyStatusShareCanvas";
import { dailyStatusSkinForMenpai } from "./skins";
import type { DailyJianghuStatus } from "./types";
import { useState } from "react";
import type { CSSProperties } from "react";

type DailyStatusCardProps = {
  status: DailyJianghuStatus;
  onClose: () => void;
};

export function DailyStatusCard({ status, onClose }: DailyStatusCardProps) {
  const skin = dailyStatusSkinForMenpai(status.menpai);
  const [lineIndex, setLineIndex] = useState(() =>
    Math.max(0, skin.linePool.indexOf(status.petLine)),
  );
  const displayedLine = skin.linePool[lineIndex] ?? status.petLine;
  const heroGoodFor = status.goodFor.find((item) => Array.from(item).length <= 2) ?? status.goodFor[0];
  const style = {
    "--daily-primary": skin.colors.primary,
    "--daily-secondary": skin.colors.secondary,
    "--daily-accent": skin.colors.accent,
    "--daily-paper": skin.colors.paper,
    "--daily-ink": skin.colors.ink,
  } as CSSProperties;

  return (
    <article className="daily-status-card no-drag" style={style} aria-label="今日江湖状态">
      <div className="daily-card-corner" aria-hidden="true" />
      <header className="daily-status-header">
        <div className="daily-status-title-row">
          <h2>今日江湖状态</h2>
          <button className="daily-status-top-close" type="button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="daily-status-sect-badge">{skin.displayName}</div>
        <DailyStatusMascot
          animalAnchor={status.animalAnchor}
          glyph={status.glyph}
          mascot={skin.mascot}
        />
      </header>

      <section className="daily-status-hero">
        <p>
          <span>今日</span>
          <strong>宜{heroGoodFor}</strong>
        </p>
        <span>{summaryFor(status.goodFor)}</span>
      </section>

      <div className="daily-status-divider" aria-hidden="true" />

      <div className="daily-status-metrics compact" aria-label="江湖状态参数">
        <DailyMetric label="动势" value={status.metrics.momentum} />
        <DailyMetric label="心气" value={status.metrics.heart} />
        <DailyMetric label="亲友缘" value={status.metrics.social} />
      </div>

      <section className="daily-status-section good">
        <h3>今日宜</h3>
        <div className="daily-status-chip-row">
          {status.goodFor.map((item) => <span key={item} className="daily-status-chip">{item}</span>)}
        </div>
      </section>

      <section className="daily-status-section avoid">
        <h3>今日忌</h3>
        <div className="daily-status-chip-row">
          {status.avoid.map((item) => <span key={item} className="daily-status-chip muted">{item}</span>)}
        </div>
      </section>

      <p className="daily-status-line">{displayedLine}</p>

      <footer className="daily-status-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => setLineIndex((current) => (current + 1) % skin.linePool.length)}
        >
          换一句
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => exportDailyStatusPng({ ...status, petLine: displayedLine })}
        >
          保存图片
        </button>
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
      aria-label={`${animalAnchor}今日状态印章`}
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

function summaryFor(goodFor: string[]): string {
  return `适合${goodFor.join("、")}，轻松做日常。`;
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
