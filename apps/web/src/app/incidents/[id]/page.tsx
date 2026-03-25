"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck, Timer, Hash } from "lucide-react";
import { toast } from "sonner";
import { api, type Incident, type Monitor, type Ping } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ErrorBanner } from "@/components/ui/error-banner";

interface TimelineEntry {
  time: string;
  label: string;
  type: "open" | "resolve" | "ping" | "miss";
}

const typeColors = {
  open: "bg-critical border-critical",
  resolve: "bg-alive border-alive",
  ping: "bg-blue-400 border-blue-400",
  miss: "bg-warn border-warn",
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function IncidentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [incident, setIncident] = useState<Incident | null>(null);
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [pings, setPings] = useState<Ping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const handleAcknowledge = async () => {
    if (!incident) return;
    setAcknowledging(true);
    const original = incident;
    setIncident({ ...incident, status: "acknowledged", acknowledgedAt: new Date().toISOString() });
    try {
      const updated = await api<Incident>(`/api/v1/incidents/${id}/acknowledge`, { method: "POST" });
      setIncident(updated);
      toast.success("Incident acknowledged");
    } catch (err) {
      setIncident(original);
      toast.error("Failed to acknowledge", { description: (err as Error).message });
    } finally {
      setAcknowledging(false);
    }
  };

  useEffect(() => {
    api<Incident>(`/api/v1/incidents/${id}`)
      .then(async (inc) => {
        setIncident(inc);
        const [mon, p] = await Promise.all([
          api<Monitor>(`/api/v1/monitors/${inc.monitorId}`).catch(() => null),
          api<Ping[]>(`/api/v1/monitors/${inc.monitorId}/pings`).catch(
            () => [],
          ),
        ]);
        setMonitor(mon);
        setPings(p);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <ErrorBanner
        message={error ?? "Incident not found"}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Build timeline
  const timeline: TimelineEntry[] = [];
  timeline.push({
    time: incident.startedAt,
    label: `Incident opened — ${incident.reason ?? "unknown reason"}`,
    type: "open",
  });

  const incidentStart = new Date(incident.startedAt).getTime();
  const incidentEnd = incident.resolvedAt
    ? new Date(incident.resolvedAt).getTime()
    : Date.now();

  for (const ping of pings) {
    const t = new Date(ping.createdAt).getTime();
    if (t >= incidentStart && t <= incidentEnd) {
      timeline.push({
        time: ping.createdAt,
        label: `Ping: ${ping.type}${ping.body ? ` — ${ping.body.slice(0, 80)}` : ""}`,
        type: "ping",
      });
    }
  }

  if (incident.resolvedAt) {
    timeline.push({
      time: incident.resolvedAt,
      label: "Incident resolved",
      type: "resolve",
    });
  }

  timeline.sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Breadcrumb */}
      <Breadcrumbs items={[
        { label: "Incidents", href: "/incidents" },
        { label: `#${id.slice(0, 8)}` },
      ]} />

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Incident #{id.slice(0, 8)}
          </h1>
          {monitor && (
            <p className="text-muted-foreground text-sm mt-1">
              Monitor:{" "}
              <Link
                href={`/monitors/${monitor.id}`}
                className="text-primary hover:text-primary/80 transition-colors"
              >
                {monitor.name}
              </Link>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {incident.status === "open" && (
            <Button size="xs" variant="outline" onClick={handleAcknowledge} disabled={acknowledging}>
              <ShieldCheck className="size-3.5" />
              {acknowledging ? "..." : "Acknowledge"}
            </Button>
          )}
          <Badge
            variant="outline"
            className={`gap-1.5 ${
              incident.status === "open"
                ? "bg-critical/10 text-critical border-critical/20"
                : incident.status === "acknowledged"
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  : "bg-alive/10 text-alive border-alive/20"
            }`}
          >
            <span className={`size-1.5 rounded-full ${
              incident.status === "open" ? "bg-critical animate-pulse-dot" :
              incident.status === "acknowledged" ? "bg-blue-400" : "bg-alive"
            }`} />
            {incident.status}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-4">
        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Reason</p>
                  <p className="text-lg font-semibold mt-1 truncate">{incident.reason ?? "Unknown"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{incident.missedPingsCount} missed pings</p>
                </div>
                <div className="size-9 rounded-lg bg-critical/5 border border-critical/10 flex items-center justify-center shrink-0">
                  <Hash className="size-4 text-critical" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="text-lg font-semibold mt-1 tabular-nums">
                    {formatDuration(incident.downtimeSeconds)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{incident.status === "resolved" ? "Total downtime" : "Ongoing"}</p>
                </div>
                <div className="size-9 rounded-lg bg-warn/5 border border-warn/10 flex items-center justify-center shrink-0">
                  <Timer className="size-4 text-warn" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Started</p>
                  <p className="text-lg font-semibold mt-1 tabular-nums">
                    {new Date(incident.startedAt).toLocaleTimeString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(incident.startedAt).toLocaleDateString()}</p>
                </div>
                <div className="size-9 rounded-lg bg-critical/5 border border-critical/10 flex items-center justify-center shrink-0">
                  <Clock className="size-4 text-critical" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Resolved</p>
                  <p className="text-lg font-semibold mt-1 tabular-nums">
                    {incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleTimeString() : "\u2014"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleDateString() : "Not yet resolved"}</p>
                </div>
                <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${incident.resolvedAt ? "bg-alive/5 border border-alive/10" : "bg-muted border border-border"}`}>
                  <CheckCircle2 className={`size-4 ${incident.resolvedAt ? "text-alive" : "text-muted-foreground"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Incident Timeline</CardTitle>
          <CardDescription>
            Chronological event history for this incident
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative ml-3">
            <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
            {timeline.map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
                className="relative pl-6 pb-6 last:pb-0"
              >
                <div
                  className={`absolute left-0 top-1 size-2.5 rounded-full -translate-x-1 ${typeColors[entry.type]}`}
                />
                <p className="text-sm">{entry.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums font-mono">
                  {new Date(entry.time).toLocaleString()}
                </p>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
