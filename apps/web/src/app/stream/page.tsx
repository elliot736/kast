"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useEventStream, type StreamEvent } from "@/hooks/use-event-stream";
import { Radio, Zap, AlertTriangle, Activity } from "lucide-react";

type FilterType = "all" | "ping" | "monitor-state" | "incident" | "job-run" | "job-log";

const dotColor: Record<string, string> = {
  ping: "bg-blue-400",
  "monitor-state": "bg-warn",
  incident: "bg-critical",
  "job-run": "bg-alive",
  "job-log": "bg-neutral",
};

const badgeStyle: Record<string, string> = {
  ping: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "monitor-state": "bg-warn/10 text-warn border-warn/20",
  incident: "bg-critical/10 text-critical border-critical/20",
  "job-run": "bg-alive/10 text-alive border-alive/20",
  "job-log": "bg-neutral/10 text-neutral border-neutral/20",
};

export default function StreamPage() {
  const { events, connected } = useEventStream();
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = useMemo(
    () =>
      filter === "all"
        ? events
        : events.filter((e) => e.type === filter),
    [events, filter],
  );

  const counts = useMemo(() => {
    let pings = 0;
    let incidents = 0;
    let jobRuns = 0;
    for (const e of events) {
      if (e.type === "ping") pings++;
      else if (e.type === "incident") incidents++;
      else if (e.type === "job-run") jobRuns++;
    }
    return { total: events.length, pings, incidents, jobRuns };
  }, [events]);

  const filters: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "Pings", value: "ping" },
    { label: "State", value: "monitor-state" },
    { label: "Incidents", value: "incident" },
    { label: "Job Runs", value: "job-run" },
    { label: "Job Logs", value: "job-log" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Stream</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time event feed from all monitors
          </p>
        </div>
        <Badge
          variant="outline"
          className={`gap-1.5 ${
            connected
              ? "bg-alive/10 text-alive border-alive/20"
              : "bg-critical/10 text-critical border-critical/20"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              connected ? "bg-alive animate-pulse-dot" : "bg-critical"
            }`}
          />
          {connected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-0">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center">
                <Activity className="size-3.5 text-primary" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Events This Session</p>
                <p className="text-lg font-semibold tabular-nums">{counts.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-blue-500/5 border border-blue-500/10 flex items-center justify-center">
                <Zap className="size-3.5 text-blue-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Ping Events</p>
                <p className="text-lg font-semibold tabular-nums">{counts.pings}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-critical/5 border border-critical/10 flex items-center justify-center">
                <AlertTriangle className="size-3.5 text-critical" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Incident Events</p>
                <p className="text-lg font-semibold tabular-nums">{counts.incidents}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-alive/5 border border-alive/10 flex items-center justify-center">
                <Zap className="size-3.5 text-alive" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Job Run Events</p>
                <p className="text-lg font-semibold tabular-nums">{counts.jobRuns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Event Feed */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-muted-foreground" />
              <CardTitle>Event Feed</CardTitle>
            </div>
            <div className="flex gap-1">
              {filters.map((f) => (
                <Button
                  key={f.value}
                  variant={filter === f.value ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Radio className="size-6 mb-3 opacity-30" />
              <p className="text-sm">Waiting for events...</p>
              <p className="text-xs mt-1 text-muted-foreground/60">
                Events will appear here in real time
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[520px]">
              <div>
                {filtered.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                  >
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${
                        dotColor[event.type] ?? "bg-neutral"
                      }`}
                    />
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${badgeStyle[event.type] ?? ""}`}
                    >
                      {event.type}
                    </Badge>
                    <span className="flex-1 min-w-0 font-mono text-[11px] text-muted-foreground truncate">
                      {JSON.stringify(event.data, null, 0)}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60 shrink-0 tabular-nums font-mono">
                      {new Date(event.receivedAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
