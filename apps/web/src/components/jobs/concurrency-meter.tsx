"use client";

import { Progress } from "@/components/ui/progress";

export function ConcurrencyMeter({
  running,
  limit,
  policy,
}: {
  running: number;
  limit: number;
  policy: string;
}) {
  const percent = limit > 0 ? Math.min((running / limit) * 100, 100) : 0;
  const isAtLimit = running >= limit;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Concurrency: {running}/{limit}
        </span>
        <span className="text-muted-foreground capitalize">
          {policy}
        </span>
      </div>
      <Progress
        value={percent}
        className={`h-1.5 ${isAtLimit ? "[&>div]:bg-warn" : "[&>div]:bg-alive"}`}
      />
    </div>
  );
}
