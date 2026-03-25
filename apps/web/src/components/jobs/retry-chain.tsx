"use client";

import Link from "next/link";
import { RunStatusBadge } from "./run-status-badge";
import type { JobRun } from "@/lib/api";
import { ArrowRight } from "lucide-react";

export function RetryChain({
  runs,
  currentRunId,
  jobId,
}: {
  runs: JobRun[];
  currentRunId: string;
  jobId: string;
}) {
  if (runs.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {runs.map((run, i) => (
        <div key={run.id} className="flex items-center gap-2">
          {i > 0 && <ArrowRight className="size-3 text-muted-foreground" />}
          <Link
            href={`/jobs/${jobId}/runs/${run.id}`}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
              run.id === currentRunId
                ? "border-primary/30 bg-primary/5"
                : "border-border hover:border-primary/20"
            }`}
          >
            <span className="text-muted-foreground tabular-nums">#{run.attempt}</span>
            <RunStatusBadge status={run.status} />
          </Link>
        </div>
      ))}
    </div>
  );
}
