"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Clock, Calendar, Code, ChevronDown, ChevronUp } from "lucide-react";

// ── Presets ──────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Every minute", cron: "* * * * *" },
  { label: "Every 5 min", cron: "*/5 * * * *" },
  { label: "Every 15 min", cron: "*/15 * * * *" },
  { label: "Every 30 min", cron: "*/30 * * * *" },
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily (midnight)", cron: "0 0 * * *" },
  { label: "Daily (3 AM)", cron: "0 3 * * *" },
  { label: "Weekly (Sun)", cron: "0 0 * * 0" },
  { label: "Monthly (1st)", cron: "0 0 1 * *" },
] as const;

// ── Cron field definitions ──────────────────────────────────────────

interface CronField {
  key: string;
  label: string;
  range: string;
  min: number;
  max: number;
}

const CRON_FIELDS: CronField[] = [
  { key: "minute", label: "Minute", range: "0–59", min: 0, max: 59 },
  { key: "hour", label: "Hour", range: "0–23", min: 0, max: 23 },
  { key: "dayOfMonth", label: "Day of Month", range: "1–31", min: 1, max: 31 },
  { key: "month", label: "Month", range: "1–12", min: 1, max: 12 },
  { key: "dayOfWeek", label: "Day of Week", range: "0–7", min: 0, max: 7 },
];

// ── Human-readable cron description ─────────────────────────────────

function describeCron(cron: string): string {
  if (!cron || !cron.trim()) return "No schedule set";

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "Invalid cron expression";

  const [minute, hour, dom, month, dow] = parts;

  // Common patterns
  if (cron === "* * * * *") return "Every minute";
  if (minute.startsWith("*/") && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `Every ${minute.slice(2)} minutes`;
  }
  if (minute === "0" && hour.startsWith("*/") && dom === "*" && month === "*" && dow === "*") {
    const h = parseInt(hour.slice(2));
    return `Every ${h} hour${h > 1 ? "s" : ""}`;
  }
  if (minute === "0" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return "Every hour, on the hour";
  }

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  let desc = "";

  // Time part
  if (minute !== "*" && hour !== "*") {
    const h = parseInt(hour);
    const m = parseInt(minute);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    desc += `At ${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
  } else if (minute !== "*") {
    desc += `At minute ${minute}`;
  }

  // Day of week
  if (dow !== "*") {
    const d = parseInt(dow);
    if (!isNaN(d) && d >= 0 && d <= 7) {
      desc += `${desc ? ", " : ""}every ${dayNames[d]}`;
    }
  }

  // Day of month
  if (dom !== "*") {
    const d = parseInt(dom);
    if (!isNaN(d)) {
      const suffix = d === 1 || d === 21 || d === 31 ? "st" : d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : "th";
      desc += `${desc ? ", " : ""}on the ${d}${suffix}`;
    }
  }

  // Month
  if (month !== "*") {
    const m = parseInt(month);
    if (!isNaN(m) && m >= 1 && m <= 12) {
      desc += `${desc ? " of " : "In "}${monthNames[m]}`;
    }
  }

  return desc || "Custom schedule";
}

// ── Compute next run times ──────────────────────────────────────────

function getNextRuns(cron: string, count: number = 3): Date[] {
  if (!cron || !cron.trim()) return [];
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return [];

  const [minPart, hourPart, domPart, monthPart, dowPart] = parts;
  const runs: Date[] = [];
  const now = new Date();
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let i = 0; i < 1440 * 60 && runs.length < count; i++) {
    const min = candidate.getMinutes();
    const hr = candidate.getHours();
    const dom = candidate.getDate();
    const mon = candidate.getMonth() + 1;
    const dow = candidate.getDay();

    if (
      matchField(minPart, min) &&
      matchField(hourPart, hr) &&
      matchField(domPart, dom) &&
      matchField(monthPart, mon) &&
      (matchField(dowPart, dow) || (dowPart === "7" && dow === 0))
    ) {
      runs.push(new Date(candidate));
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return runs;
}

function matchField(pattern: string, value: number): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("*/")) {
    const step = parseInt(pattern.slice(2));
    return !isNaN(step) && step > 0 && value % step === 0;
  }
  if (pattern.includes(",")) {
    return pattern.split(",").some((p) => matchField(p.trim(), value));
  }
  if (pattern.includes("-")) {
    const [a, b] = pattern.split("-").map(Number);
    return !isNaN(a) && !isNaN(b) && value >= a && value <= b;
  }
  return parseInt(pattern) === value;
}

// ── Component ───────────────────────────────────────────────────────

type ScheduleMode = "preset" | "builder" | "raw";

interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
}

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  const [mode, setMode] = useState<ScheduleMode>(() => {
    if (!value) return "preset";
    if (PRESETS.some((p) => p.cron === value)) return "preset";
    return "raw";
  });

  const [builderFields, setBuilderFields] = useState<Record<string, string>>(() => {
    const parts = (value || "* * * * *").trim().split(/\s+/);
    return {
      minute: parts[0] ?? "*",
      hour: parts[1] ?? "*",
      dayOfMonth: parts[2] ?? "*",
      month: parts[3] ?? "*",
      dayOfWeek: parts[4] ?? "*",
    };
  });

  const [showNextRuns, setShowNextRuns] = useState(false);

  const description = useMemo(() => describeCron(value), [value]);
  const nextRuns = useMemo(() => (showNextRuns ? getNextRuns(value) : []), [value, showNextRuns]);

  const cronParts = (value || "").trim().split(/\s+/);
  const isValidCron = cronParts.length === 5;

  const updateBuilderField = (key: string, val: string) => {
    const next = { ...builderFields, [key]: val || "*" };
    setBuilderFields(next);
    const cron = `${next.minute} ${next.hour} ${next.dayOfMonth} ${next.month} ${next.dayOfWeek}`;
    onChange(cron);
  };

  const modes: { value: ScheduleMode; label: string; icon: React.ReactNode }[] = [
    { value: "preset", label: "Presets", icon: <Clock className="size-3" /> },
    { value: "builder", label: "Builder", icon: <Calendar className="size-3" /> },
    { value: "raw", label: "Cron", icon: <Code className="size-3" /> },
  ];

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5 w-fit">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
              mode === m.value
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
            onClick={() => setMode(m.value)}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      {/* Preset mode */}
      {mode === "preset" && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.cron}
              type="button"
              className={cn(
                "rounded-md border px-2.5 py-2 text-xs text-left transition-all",
                value === preset.cron
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : "border-border bg-surface/50 text-muted-foreground hover:border-primary/20 hover:bg-surface hover:text-foreground",
              )}
              onClick={() => {
                onChange(preset.cron);
                setBuilderFields({
                  minute: preset.cron.split(" ")[0],
                  hour: preset.cron.split(" ")[1],
                  dayOfMonth: preset.cron.split(" ")[2],
                  month: preset.cron.split(" ")[3],
                  dayOfWeek: preset.cron.split(" ")[4],
                });
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* Builder mode */}
      {mode === "builder" && (
        <div className="space-y-3">
          {/* Live cron preview segments */}
          <div className="flex items-center gap-1">
            {CRON_FIELDS.map((field, i) => (
              <div key={field.key} className="flex items-center gap-1">
                <div
                  className={cn(
                    "flex items-center justify-center rounded-md border font-mono text-sm h-8 min-w-[2.5rem] px-2 tabular-nums",
                    builderFields[field.key] === "*"
                      ? "border-border bg-surface/50 text-muted-foreground"
                      : "border-primary/30 bg-primary/5 text-primary",
                  )}
                >
                  {builderFields[field.key]}
                </div>
                {i < 4 && <span className="text-muted-foreground/30 text-xs select-none">&middot;</span>}
              </div>
            ))}
          </div>

          {/* Field inputs */}
          <div className="grid grid-cols-5 gap-2">
            {CRON_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  {field.label}
                </Label>
                <Input
                  value={builderFields[field.key] === "*" ? "" : builderFields[field.key]}
                  onChange={(e) => updateBuilderField(field.key, e.target.value)}
                  placeholder="*"
                  className="font-mono text-xs h-8 text-center"
                />
                <p className="text-[9px] text-muted-foreground/50 text-center">{field.range}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw mode */}
      {mode === "raw" && (
        <div className="space-y-1.5">
          <Input
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              const parts = e.target.value.trim().split(/\s+/);
              if (parts.length === 5) {
                setBuilderFields({
                  minute: parts[0],
                  hour: parts[1],
                  dayOfMonth: parts[2],
                  month: parts[3],
                  dayOfWeek: parts[4],
                });
              }
            }}
            placeholder="* * * * *"
            className="font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Format: minute hour day-of-month month day-of-week
          </p>
        </div>
      )}

      {/* Human-readable description + next runs */}
      {value && (
        <div className="rounded-md border border-border bg-surface/30 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <p className={cn(
              "text-xs font-medium",
              isValidCron ? "text-foreground" : "text-critical",
            )}>
              {isValidCron ? description : "Invalid cron expression"}
            </p>
            {isValidCron && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                onClick={() => setShowNextRuns((v) => !v)}
              >
                Next runs
                {showNextRuns ? <ChevronUp className="size-2.5" /> : <ChevronDown className="size-2.5" />}
              </button>
            )}
          </div>
          {showNextRuns && nextRuns.length > 0 && (
            <div className="space-y-0.5">
              {nextRuns.map((date, i) => (
                <p key={i} className="text-[11px] text-muted-foreground tabular-nums font-mono">
                  {date.toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
