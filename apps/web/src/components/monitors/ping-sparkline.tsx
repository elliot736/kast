"use client";

import { useEffect, useState } from "react";
import { api, type Ping } from "@/lib/api";

interface PingSparklineProps {
  monitorId: string;
}

export function PingSparkline({ monitorId }: PingSparklineProps) {
  const [points, setPoints] = useState<number[] | null>(null);

  useEffect(() => {
    api<Ping[]>(`/api/v1/monitors/${monitorId}/pings`)
      .then((pings) => {
        const durations = pings
          .filter((p) => p.type === "success" && p.durationMs !== null)
          .slice(0, 20)
          .map((p) => p.durationMs!)
          .reverse();
        if (durations.length >= 2) setPoints(durations);
      })
      .catch(() => {});
  }, [monitorId]);

  if (!points || points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 48;
  const h = 16;
  const step = w / (points.length - 1);

  const pathData = points
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="inline-block ml-2 opacity-60"
    >
      <path
        d={pathData}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
