import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Ping } from "@/lib/api";

interface HealthTrendProps {
  pings: Ping[];
}

export function HealthTrend({ pings }: HealthTrendProps) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  const recent: Ping[] = [];
  const previous: Ping[] = [];

  for (const p of pings) {
    if (p.type !== "success" && p.type !== "fail") continue;
    const t = new Date(p.createdAt).getTime();
    const age = now - t;
    if (age <= sevenDays) {
      recent.push(p);
    } else if (age <= sevenDays * 2) {
      previous.push(p);
    }
  }

  if (recent.length === 0 || previous.length === 0) {
    return <Minus className="size-3 text-muted-foreground/40" />;
  }

  const recentRate = recent.filter((p) => p.type === "success").length / recent.length;
  const prevRate = previous.filter((p) => p.type === "success").length / previous.length;
  const diff = recentRate - prevRate;

  if (Math.abs(diff) < 0.01) {
    return <Minus className="size-3 text-muted-foreground/40" />;
  }

  if (diff > 0) {
    return <TrendingUp className="size-3 text-alive" />;
  }

  return <TrendingDown className="size-3 text-critical" />;
}
