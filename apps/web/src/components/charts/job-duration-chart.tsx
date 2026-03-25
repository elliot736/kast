"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { JobRun } from "@/lib/api";

const config = {
  duration: {
    label: "Duration",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig;

export function JobDurationChart({ runs }: { runs: JobRun[] }) {
  const data = runs
    .filter((r) => r.status === "success" && r.durationMs !== null)
    .map((r) => ({
      time: new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      duration: r.durationMs,
    }))
    .reverse();

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <p className="text-sm text-muted-foreground">No duration data yet.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Duration appears after successful runs.</p>
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <AreaChart data={data} accessibilityLayer>
        <defs>
          <linearGradient id="jobDurationGrad" x1="0" y1="0" x2="0" y2="1">
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
          fill="url(#jobDurationGrad)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
