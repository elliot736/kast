"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Ping } from "@/lib/api";

const config = {
  duration: {
    label: "Duration",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig;

export function DurationChart({ pings }: { pings: Ping[] }) {
  const data = pings
    .filter((p) => p.type === "success" && p.durationMs !== null)
    .map((p) => ({
      time: new Date(p.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      duration: p.durationMs,
    }))
    .reverse();

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <p className="text-sm text-muted-foreground">No duration data yet.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Send start + success pings to track runtime.
        </p>
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <AreaChart data={data} accessibilityLayer>
        <defs>
          <linearGradient id="durationGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-duration)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--color-duration)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} fontSize={10} />
        <YAxis tickLine={false} axisLine={false} tickMargin={4} fontSize={10} width={50} tickFormatter={(v) => `${v}ms`} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${value}ms`} />} />
        <Area
          type="monotone"
          dataKey="duration"
          stroke="var(--color-duration)"
          fill="url(#durationGrad)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
