"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { JobRunLog } from "@/lib/api";
import { ArrowDown } from "lucide-react";

const levelColors: Record<string, string> = {
  info: "bg-primary/10 text-primary border-primary/20",
  warn: "bg-warn/10 text-warn border-warn/20",
  error: "bg-critical/10 text-critical border-critical/20",
  debug: "bg-neutral/10 text-neutral border-neutral/20",
};

export function LogViewer({
  logs,
  filterLevel,
  onFilterChange,
}: {
  logs: JobRunLog[];
  filterLevel: string | null;
  onFilterChange: (level: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const filteredLogs = filterLevel
    ? logs.filter((l) => l.level === filterLevel)
    : logs;

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const levels = ["info", "warn", "error", "debug"] as const;

  return (
    <div className="space-y-2">
      {/* Level filter */}
      <div className="flex items-center gap-1.5">
        <Button
          variant={filterLevel === null ? "secondary" : "ghost"}
          size="xs"
          onClick={() => onFilterChange(null)}
        >
          All
        </Button>
        {levels.map((level) => (
          <Button
            key={level}
            variant={filterLevel === level ? "secondary" : "ghost"}
            size="xs"
            onClick={() => onFilterChange(level)}
          >
            {level}
            <span className="ml-1 text-muted-foreground tabular-nums">
              {logs.filter((l) => l.level === level).length}
            </span>
          </Button>
        ))}
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-[400px] overflow-y-auto rounded-md border border-border bg-black/50 p-3 font-mono text-xs"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No log entries</p>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] px-1 py-0 ${levelColors[log.level] ?? ""}`}
                >
                  {log.level}
                </Badge>
                <span className="text-foreground/90 break-all">{log.message}</span>
              </div>
            ))}
          </div>
        )}

        {!autoScroll && (
          <Button
            variant="secondary"
            size="xs"
            className="absolute bottom-4 right-4"
            onClick={() => {
              setAutoScroll(true);
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
          >
            <ArrowDown className="size-3" />
            Follow
          </Button>
        )}
      </div>
    </div>
  );
}
