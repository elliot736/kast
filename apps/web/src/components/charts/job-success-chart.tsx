"use client";

import { Bar, BarChart, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { JobRun } from "@/lib/api";

const config = {
  rate: {
    label: "Success Rate",
    color: "var(--color-alive)",
  },
} satisfies ChartConfig;

export function JobSuccessChart({ runs }: { runs: JobRun[] }) {
  const dayMap = new Map<string, { success: number; total: number }>();

  for (const run of runs) {
    if (run.status !== "success" && run.status !== "failed" && run.status !== "timeout") continue;
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = dayMap.get(day) ?? { success: 0, total: 0 };
    entry.total++;
    if (run.status === "success") entry.success++;
    dayMap.set(day, entry);
  }

  const data = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([day, d]) => ({
      day: new Date(day + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      rate: d.total > 0 ? Math.round((d.success / d.total) * 100) : 100,
      success: d.success,
      total: d.total,
    }));

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <p className="text-sm text-muted-foreground">No success rate data yet.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Data will appear after job runs complete.</p>
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <BarChart data={data} accessibilityLayer>
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={10}
          interval="preserveStartEnd"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) =>
                `${value}% (${item.payload.success}/${item.payload.total} runs)`
              }
            />
          }
        />
        <Bar dataKey="rate" fill="var(--color-rate)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
