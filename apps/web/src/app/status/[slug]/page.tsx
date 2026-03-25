"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo, formatDuration } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface DailyUptime {
  date: string;
  percent: number;
}

interface StatusMonitor {
  id: string;
  name: string;
  status: "healthy" | "late" | "down" | "paused";
  uptimePercent: number;
  lastPingAt: string | null;
  dailyUptime: DailyUptime[];
}

interface ActiveIncident {
  id: string;
  monitorName: string;
  reason: string;
  startedAt: string;
  status: string;
}

interface RecentIncident {
  id: string;
  monitorName: string;
  reason: string;
  startedAt: string;
  resolvedAt: string | null;
  downtimeSeconds: number | null;
}

interface StatusPage {
  teamName: string;
  teamSlug: string;
  overall: "operational" | "degraded" | "outage";
  monitors: StatusMonitor[];
  activeIncidents: ActiveIncident[];
  recentIncidents: RecentIncident[];
}

const overallConfig = {
  operational: {
    label: "All Systems Operational",
    bg: "bg-alive/10",
    border: "border-alive/20",
    text: "text-alive",
    dot: "bg-alive",
  },
  degraded: {
    label: "Degraded Performance",
    bg: "bg-warn/10",
    border: "border-warn/20",
    text: "text-warn",
    dot: "bg-warn",
  },
  outage: {
    label: "Major Outage",
    bg: "bg-critical/10",
    border: "border-critical/20",
    text: "text-critical",
    dot: "bg-critical",
  },
};

const statusColors = {
  healthy: "bg-alive",
  late: "bg-warn",
  down: "bg-critical",
  paused: "bg-muted-foreground",
};

const statusLabels = {
  healthy: "Healthy",
  late: "Late",
  down: "Down",
  paused: "Paused",
};

function UptimeBars({ dailyUptime }: { dailyUptime: DailyUptime[] }) {
  const [hoveredDay, setHoveredDay] = useState<DailyUptime | null>(null);

  return (
    <div className="space-y-2">
      {/* Tooltip */}
      <div className="h-5 flex items-center">
        {hoveredDay ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">{hoveredDay.date}</span>
            {" \u2014 "}
            <span
              className={
                hoveredDay.percent >= 99.5
                  ? "text-alive"
                  : hoveredDay.percent >= 95
                    ? "text-warn"
                    : "text-critical"
              }
            >
              {hoveredDay.percent}%
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/50">Hover for details</p>
        )}
      </div>

      {/* Bars */}
      <div className="flex items-end gap-0.5 h-10">
        {dailyUptime.map((day) => {
          const color =
            day.percent >= 99.5
              ? "bg-alive"
              : day.percent >= 95
                ? "bg-warn"
                : "bg-critical";
          const isHovered = hoveredDay?.date === day.date;
          return (
            <div
              key={day.date}
              className={`flex-1 rounded-sm min-w-1 transition-all cursor-pointer ${color} ${
                isHovered
                  ? "opacity-100 ring-1 ring-foreground/20"
                  : hoveredDay
                    ? "opacity-40"
                    : "opacity-80 hover:opacity-100"
              }`}
              style={{ height: `${Math.max(day.percent, 10)}%` }}
              onMouseEnter={() => setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
            />
          );
        })}
      </div>

      {/* Axis labels */}
      <div className="flex justify-between">
        <span className="text-[10px] text-muted-foreground/50">30 days ago</span>
        <span className="text-[10px] text-muted-foreground/50">Today</span>
      </div>
    </div>
  );
}

export default function PublicStatusPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [data, setData] = useState<StatusPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/status/${slug}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Status page not found");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Auto-refresh every 30s
    const interval = setInterval(() => {
      fetch(`${API_BASE}/status/${slug}`)
        .then((res) => res.json())
        .then(setData)
        .catch(() => {});
    }, 30_000);

    return () => clearInterval(interval);
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="w-full max-w-3xl mx-auto px-4 space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Status Page Not Found</h1>
          <p className="text-muted-foreground">
            The team &quot;{slug}&quot; does not exist or has no public status page.
          </p>
        </div>
      </div>
    );
  }

  const overall = overallConfig[data.overall];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-3xl mx-auto px-4 py-12"
      >
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            {data.teamName}
          </h1>
          <p className="text-muted-foreground text-sm">System Status</p>
        </div>

        {/* Overall Status */}
        <div
          className={`rounded-lg border p-5 mb-8 ${overall.bg} ${overall.border}`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${overall.dot} animate-pulse`} />
            <span className={`text-lg font-semibold ${overall.text}`}>
              {overall.label}
            </span>
          </div>
        </div>

        {/* Active Incidents */}
        {data.activeIncidents.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Active Incidents
            </h2>
            <div className="space-y-3">
              {data.activeIncidents.map((inc) => (
                <Card
                  key={inc.id}
                  className="border-critical/20 bg-critical/5"
                >
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-critical">
                        {inc.monitorName}
                      </span>
                      <Badge variant="outline" className="text-muted-foreground text-xs font-normal">
                        {timeAgo(inc.startedAt)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{inc.reason}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Monitors */}
        <div className="mb-10">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Monitors
          </h2>
          <div className="space-y-3">
            {data.monitors.map((monitor) => (
              <Card key={monitor.id}>
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-2 h-2 rounded-full ${statusColors[monitor.status]}`}
                      />
                      <CardTitle className="text-base">{monitor.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {statusLabels[monitor.status]}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {monitor.uptimePercent}% uptime
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {/* 30-day uptime bars — interactive hover pattern */}
                  <UptimeBars dailyUptime={monitor.dailyUptime} />
                </CardContent>
              </Card>
            ))}

            {data.monitors.length === 0 && (
              <p className="text-muted-foreground text-sm py-4 text-center">
                No monitors configured for this team.
              </p>
            )}
          </div>
        </div>

        {/* Recent Incidents */}
        {data.recentIncidents.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Past Incidents (7 days)
            </h2>
            <div className="space-y-3">
              {data.recentIncidents.map((inc) => (
                <Card key={inc.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">
                        {inc.monitorName}
                      </span>
                      <Badge variant="outline" className="text-muted-foreground text-xs font-normal">
                        {new Date(inc.startedAt).toLocaleDateString()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inc.reason} — resolved in{" "}
                      {formatDuration(inc.downtimeSeconds)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border pt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by{" "}
            <a
              href="https://github.com/your-org/kast"
              className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              Kast
            </a>
            {" "}&mdash; Open-source job monitoring
          </p>
        </div>
      </motion.div>
    </div>
  );
}
