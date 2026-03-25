"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { api } from "@/lib/api";
import { RotateCcw, Play, Square } from "lucide-react";

interface ReplayEvent {
  monitorId: string;
  type?: string;
  timestamp: string;
  _replay: { partition: number; offset: string; originalTimestamp: number };
  [key: string]: unknown;
}

const typeBadgeStyle: Record<string, string> = {
  ping: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "monitor-state": "bg-warn/10 text-warn border-warn/20",
  incident: "bg-critical/10 text-critical border-critical/20",
};

export default function ReplayPage() {
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [monitorId, setMonitorId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);

  const startReplay = async () => {
    if (!fromDate || !toDate) {
      setError("Please set both from and to timestamps");
      return;
    }

    setError(null);
    setEvents([]);
    setStatus("starting");

    try {
      const res = await api<{ sessionId: string; status: string }>(
        "/api/v1/replay",
        {
          method: "POST",
          body: JSON.stringify({
            fromTimestamp: fromDate.getTime(),
            toTimestamp: toDate.getTime(),
            monitorId: monitorId || undefined,
          }),
        },
      );

      setSessionId(res.sessionId);
      setStatus("streaming");

      const eventSource = new EventSource(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/v1/replay/${res.sessionId}/events`,
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "events" && data.events) {
          setEvents((prev) => [...prev, ...data.events]);
        }
        if (data.status === "completed" || data.status === "cancelled") {
          setStatus(data.status);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setStatus("completed");
        eventSource.close();
      };
    } catch (err) {
      setError((err as Error).message);
      setStatus("idle");
    }
  };

  const cancelReplay = async () => {
    if (sessionId) {
      await api(`/api/v1/replay/${sessionId}/cancel`, { method: "POST" });
      setStatus("cancelled");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Event Replay</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Replay historical events from any time range
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center">
              <RotateCcw className="size-3.5 text-primary" />
            </div>
            <div>
              <CardTitle>Replay Configuration</CardTitle>
              <CardDescription>
                Select a time window and optionally filter by monitor
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <DateTimePicker
              label="From"
              value={fromDate}
              onChange={setFromDate}
              placeholder="Start date & time"
            />
            <DateTimePicker
              label="To"
              value={toDate}
              onChange={setToDate}
              placeholder="End date & time"
            />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Monitor ID <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <Input
                type="text"
                value={monitorId}
                onChange={(e) => setMonitorId(e.target.value)}
                placeholder="uuid"
                className="font-mono text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={startReplay}
                disabled={status === "streaming"}
                className="flex-1"
              >
                <Play className="size-3" />
                {status === "streaming" ? "Replaying..." : "Start"}
              </Button>
              {status === "streaming" && (
                <Button variant="outline" size="sm" onClick={cancelReplay}>
                  <Square className="size-3" />
                </Button>
              )}
            </div>
          </div>
          {error && (
            <p className="text-xs text-critical mt-3">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Replay Results</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {events.length} events
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  status === "streaming"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : status === "completed"
                      ? "bg-alive/10 text-alive border-alive/20"
                      : "bg-surface text-muted-foreground border-border"
                }`}
              >
                {status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <RotateCcw className="size-6 mb-3 opacity-30" />
              <p className="text-sm">
                {status === "idle"
                  ? "Configure a time range and start replay"
                  : "Waiting for events..."}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div>
                {events.map((event, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-2 border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                  >
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 font-mono mt-0.5 ${typeBadgeStyle[event.type ?? ""] ?? "bg-surface text-muted-foreground border-border"}`}
                    >
                      {event.type ?? "event"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground/60 shrink-0 tabular-nums font-mono mt-0.5">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                    <pre className="text-[11px] text-muted-foreground flex-1 overflow-x-auto font-mono">
                      {JSON.stringify(event, null, 0)}
                    </pre>
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
