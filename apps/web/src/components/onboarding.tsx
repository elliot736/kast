"use client";

import { useState, useEffect, useRef } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type Monitor } from "@/lib/api";
import { CheckCircle2, Copy } from "lucide-react";

type Step = "name" | "waiting" | "done";

export function Onboarding() {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [schedule, setSchedule] = useState("");
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      };
      if (schedule) body.schedule = schedule;

      const mon = await api<Monitor>("/api/v1/monitors", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMonitor(mon);
      setStep("waiting");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (step !== "waiting" || !monitor) return;

    pollRef.current = setInterval(async () => {
      try {
        const mon = await api<Monitor>(`/api/v1/monitors/${monitor.id}`);
        if (mon.lastPingAt) {
          setStep("done");
          setMonitor(mon);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {}
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, monitor]);

  if (step === "done" && monitor) {
    return (
      <Card className="ring-1 ring-alive/30 glow-alive">
        <CardContent className="pt-8 pb-8 text-center">
          <CheckCircle2 className="size-10 mx-auto mb-4 text-alive" />
          <h2 className="text-xl font-semibold mb-2">
            First ping received!
          </h2>
          <p className="text-muted-foreground text-sm mb-6">
            <strong>{monitor.name}</strong> is now being monitored. You&apos;ll
            get alerted if it stops pinging.
          </p>
          <Button size="sm" onClick={() => (window.location.href = `/monitors/${monitor.id}`)}>
            View Monitor
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "waiting" && monitor) {
    const pingUrl = `${apiUrl}/ping/${monitor.pingUuid}/success`;
    const curlCmd = `curl -fsS --retry 3 ${pingUrl}`;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Waiting for first ping...</CardTitle>
          <CardDescription>
            Run this command to send your first ping to{" "}
            <strong>{monitor.name}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-6">
            <ScrollArea className="w-full">
              <pre className="bg-background border border-border rounded-lg p-4 text-xs font-mono text-muted-foreground">
                {curlCmd}
              </pre>
            </ScrollArea>
            <Button
              variant="outline"
              size="xs"
              className="absolute top-2 right-2"
              onClick={() => navigator.clipboard.writeText(curlCmd)}
            >
              <Copy className="size-3 mr-1" />
              Copy
            </Button>
          </div>

          <div className="flex items-center justify-center gap-3 py-6">
            <div className="flex gap-1">
              <div className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-xs text-muted-foreground">
              Listening for pings...
            </span>
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <p className="text-[11px] text-muted-foreground mb-3">
              Or integrate with your code:
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <CodeSnippet
                label="Bash / Cron"
                code={`# Add to end of your script\ncurl -fsS --retry 3 ${pingUrl}`}
              />
              <CodeSnippet
                label="kast CLI"
                code={`kast wrap -m ${monitor.pingUuid} -- ./your-script.sh`}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>Create your first monitor</CardTitle>
        <CardDescription>
          What job or pipeline do you want to watch?
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Monitor name</Label>
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
              placeholder="e.g. DB Backup, Billing Sync, Nightly Report"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Cron schedule{" "}
              <span className="text-muted-foreground/60 font-normal">
                (optional)
              </span>
            </Label>
            <Input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 3 * * *"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Leave empty to just watch for pings without a schedule.
            </p>
          </div>

          {error && (
            <p className="text-xs text-critical">{error}</p>
          )}

          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!name || creating}
            className="w-full"
          >
            {creating ? "Creating..." : "Create Monitor"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CodeSnippet({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground mb-1">
        {label}
      </p>
      <ScrollArea className="w-full">
        <pre className="text-[11px] bg-background border border-border rounded-lg p-2.5 font-mono text-muted-foreground">
          {code}
        </pre>
      </ScrollArea>
    </div>
  );
}
