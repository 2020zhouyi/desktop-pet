import { dailyStatusSkinForMenpai } from "./skins";
import type { DailyJianghuStatus } from "./types";

export function exportDailyStatusPng(status: DailyJianghuStatus): void {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) return;

  const skin = dailyStatusSkinForMenpai(status.menpai);
  context.fillStyle = skin.colors.paper;
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawPaperNoise(context, canvas.width, canvas.height);

  context.strokeStyle = skin.colors.ink;
  context.lineWidth = 6;
  roundRect(context, 74, 74, 752, 752, 46);
  context.stroke();

  context.fillStyle = skin.colors.primary;
  context.beginPath();
  context.arc(690, 202, 92, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = skin.colors.paper;
  context.font = "700 86px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(status.glyph, 690, 204);

  context.textAlign = "left";
  context.fillStyle = skin.colors.ink;
  context.font = "700 54px system-ui, sans-serif";
  context.fillText(status.title, 132, 180);

  context.font = "500 26px system-ui, sans-serif";
  context.fillStyle = skin.colors.secondary;
  context.fillText(`${skin.displayName} · ${status.animalAnchor}`, 132, 236);

  context.fillStyle = skin.colors.ink;
  context.font = "500 34px system-ui, sans-serif";
  wrapText(context, status.summary, 132, 330, 620, 48);

  drawMetric(context, "动势", status.metrics.momentum, 132, 450, skin.colors.primary);
  drawMetric(context, "心气", status.metrics.heart, 132, 538, skin.colors.secondary);
  drawMetric(context, "亲友缘", status.metrics.social, 132, 626, skin.colors.accent);

  context.font = "600 26px system-ui, sans-serif";
  context.fillStyle = skin.colors.ink;
  context.fillText(`宜 ${status.goodFor.join(" · ")}`, 132, 728);
  context.fillText(`避 ${status.avoid.join(" · ")}`, 132, 774);

  context.font = "600 28px system-ui, sans-serif";
  context.fillStyle = skin.colors.primary;
  context.fillText(status.petLine, 132, 828);

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `jianghu-status-${status.date}-${status.menpai}.png`;
  link.click();
}

function drawMetric(
  context: CanvasRenderingContext2D,
  label: string,
  value: number,
  x: number,
  y: number,
  color: string,
): void {
  context.fillStyle = "#352A22";
  context.font = "600 28px system-ui, sans-serif";
  context.fillText(label, x, y);

  context.fillStyle = "rgba(53, 42, 34, 0.12)";
  roundRect(context, x + 112, y - 24, 420, 20, 10);
  context.fill();

  context.fillStyle = color;
  roundRect(context, x + 112, y - 24, Math.max(12, 420 * (value / 100)), 20, 10);
  context.fill();

  context.fillStyle = "#352A22";
  context.font = "700 24px system-ui, sans-serif";
  context.fillText(String(value), x + 562, y);
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  let line = "";
  let currentY = y;
  for (const char of Array.from(text)) {
    const testLine = `${line}${char}`;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      line = char;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) context.fillText(line, x, currentY);
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawPaperNoise(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.globalAlpha = 0.05;
  context.fillStyle = "#352A22";
  for (let index = 0; index < 900; index += 1) {
    const x = (index * 47) % width;
    const y = (index * 83) % height;
    context.fillRect(x, y, 1, 1);
  }
  context.globalAlpha = 1;
}
