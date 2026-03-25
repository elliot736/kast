"use client";

import { useEffect, useState } from "react";
import { api, type JobRun } from "@/lib/api";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

interface DayBucket {
  day: string;
  label: string;
  success: number;
  total: number;
  rate: number;
}

export function MiniSuccessBar({ jobId }: { jobId: string }) {
  const [days, setDays] = useState<DayBucket[] | null>(null);

  useEffect(() => {
    api<JobRun[]>(`/api/v1/jobs/${jobId}/runs`)
      .then((runs) => {
        const dayMap = new Map<string, { success: number; total: number }>();
        for (const run of runs) {
          if (run.status !== "success" && run.status !== "failed" && run.status !== "timeout") continue;
          const day = new Date(run.createdAt).toISOString().slice(0, 10);
          const entry = dayMap.get(day) ?? { success: 0, total: 0 };
          entry.total++;
          if (run.status === "success") entry.success++;
          dayMap.set(day, entry);
        }

        const result: DayBucket[] = Array.from(dayMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-7)
          .map(([day, data]) => ({
            day,
            label: new Date(day + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            success: data.success,
            total: data.total,
            rate: data.total > 0 ? data.success / data.total : 1,
          }));

        setDays(result);
      })
      .catch(() => {});
  }, [jobId]);

  if (!days || days.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-end gap-px h-3 mt-1.5">
        {days.map((d) => {
          const color = d.rate >= 0.99 ? "bg-alive/70" : d.rate >= 0.95 ? "bg-warn/70" : "bg-critical/70";
          return (
            <Tooltip key={d.day}>
              <TooltipTrigger asChild>
                <div
                  className={`flex-1 rounded-[1px] min-w-[3px] cursor-default ${color}`}
                  style={{ height: `${Math.max(d.rate * 100, 15)}%` }}
                />
              </TooltipTrigger>
              <TooltipContent className="text-[10px] tabular-nums">
                {d.label}: {Math.round(d.rate * 100)}% ({d.success}/{d.total})
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
