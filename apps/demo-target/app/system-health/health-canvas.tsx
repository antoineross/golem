"use client";

import { useEffect, useRef } from "react";

const dataPoints = [42, 55, 38, 61, 73, 48, 82, 67, 59, 71, 65, 78, 54, 69, 83, 76, 62, 88, 72, 80];

export function HealthCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const graphHeight = h - 80;
    const graphTop = 30;

    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = graphTop + (graphHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();

      ctx.fillStyle = "#9ca3af";
      ctx.font = "11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${100 - i * 25}%`, 35, y + 4);
    }

    ctx.fillStyle = "#374151";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Server Load (24h)", 40, 18);

    const stepX = (w - 60) / (dataPoints.length - 1);
    const max = 100;

    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    dataPoints.forEach((val, i) => {
      const x = 40 + i * stepX;
      const y = graphTop + graphHeight - (val / max) * graphHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = "#3b82f6";
    dataPoints.forEach((val, i) => {
      const x = 40 + i * stepX;
      const y = graphTop + graphHeight - (val / max) * graphHeight;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    const alertY = h - 30;
    ctx.fillStyle = "#dc2626";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    ctx.fillText("[CRITICAL] SQL Injection vulnerability detected on /api/v1/orders/debug", 20, alertY);

    ctx.fillStyle = "#dc2626";
    ctx.globalAlpha = 0.1;
    ctx.fillRect(10, alertY - 14, w - 20, 20);
    ctx.globalAlpha = 1.0;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={760}
      height={320}
      className="w-full rounded border border-gray-100"
    />
  );
}
