"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api, type Monitor } from "@/lib/api";
import { Monitor as MonitorIcon } from "lucide-react";
import { CronBuilder } from "@/components/ui/cron-builder";

interface Props {
  onCreated: (monitor: Monitor) => void;
  onCancel: () => void;
}

export function CreateMonitorForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [schedule, setSchedule] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState("");
  const [graceSeconds, setGraceSeconds] = useState("300");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleType, setScheduleType] = useState<"cron" | "interval">("cron");

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name,
        slug,
        graceSeconds: Number(graceSeconds),
      };
      if (scheduleType === "cron" && schedule) body.schedule = schedule;
      if (scheduleType === "interval" && intervalSeconds)
        body.intervalSeconds = Number(intervalSeconds);

      const monitor = await api<Monitor>("/api/v1/monitors", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreated(monitor);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center">
            <MonitorIcon className="size-3.5 text-primary" />
          </div>
          <div>
            <CardTitle>Create Monitor</CardTitle>
            <CardDescription>
              Configure a new job or pipeline to monitor
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4 space-y-5">
        {/* Name & Slug */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Name *</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/(^-|-$)/g, ""),
                );
              }}
              placeholder="DB Backup"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Slug *</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="db-backup"
              className="font-mono text-xs"
            />
          </div>
        </div>

        {/* Schedule type toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Schedule</Label>
            <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5">
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  scheduleType === "cron"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setScheduleType("cron")}
              >
                Cron
              </button>
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  scheduleType === "interval"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setScheduleType("interval")}
              >
                Interval
              </button>
            </div>
          </div>

          {scheduleType === "cron" ? (
            <CronBuilder value={schedule} onChange={setSchedule} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Interval (seconds)
                </Label>
                <Input
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(e.target.value)}
                  placeholder="3600"
                  type="number"
                />
                <p className="text-[11px] text-muted-foreground">
                  {intervalSeconds
                    ? `Every ${Number(intervalSeconds) >= 3600
                        ? `${Math.floor(Number(intervalSeconds) / 3600)}h ${Math.floor((Number(intervalSeconds) % 3600) / 60)}m`
                        : Number(intervalSeconds) >= 60
                          ? `${Math.floor(Number(intervalSeconds) / 60)}m`
                          : `${intervalSeconds}s`
                      }`
                    : "How often should this job run?"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Grace Period (seconds)
                </Label>
                <Input
                  value={graceSeconds}
                  onChange={(e) => setGraceSeconds(e.target.value)}
                  type="number"
                />
                <p className="text-[11px] text-muted-foreground">
                  How long to wait before marking as late
                </p>
              </div>
            </div>
          )}

          {scheduleType === "cron" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Grace Period (seconds)
              </Label>
              <Input
                value={graceSeconds}
                onChange={(e) => setGraceSeconds(e.target.value)}
                type="number"
                className="max-w-[200px]"
              />
              <p className="text-[11px] text-muted-foreground">
                How long to wait before marking as late
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2">
            <p className="text-xs text-critical">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !name || !slug}
          >
            {submitting ? "Creating..." : "Create Monitor"}
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
