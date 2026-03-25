"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CronBuilder } from "@/components/ui/cron-builder";
import { api, type Job } from "@/lib/api";
import { ChevronDown, ChevronRight } from "lucide-react";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function CreateJobForm({
  onCreated,
  onCancel,
}: {
  onCreated: (job: Job) => void;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [schedule, setSchedule] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const tagsRaw = (form.get("tags") as string) || "";

    const headersRaw = (form.get("headers") as string) || "";
    let headers: Record<string, string> = {};
    if (headersRaw.trim()) {
      try {
        headers = JSON.parse(headersRaw);
        if (typeof headers !== "object" || Array.isArray(headers)) {
          throw new Error("Must be an object");
        }
      } catch {
        setError("Headers must be valid JSON object (e.g. {\"Content-Type\": \"application/json\"})");
        setSubmitting(false);
        return;
      }
    }

    const successCodesRaw = (form.get("successStatusCodes") as string) || "";
    let successStatusCodes: number[] | undefined;
    if (successCodesRaw.trim()) {
      const codes = successCodesRaw.split(",").map((s) => parseInt(s.trim(), 10));
      if (codes.some(isNaN)) {
        setError("Success status codes must be comma-separated numbers");
        setSubmitting(false);
        return;
      }
      successStatusCodes = codes;
    }

    const maxRetries = parseInt(form.get("maxRetries") as string, 10);
    const retryDelaySeconds = parseInt(form.get("retryDelaySeconds") as string, 10);
    const retryBackoffMultiplier = parseFloat(form.get("retryBackoffMultiplier") as string);
    const retryMaxDelaySeconds = parseInt(form.get("retryMaxDelaySeconds") as string, 10);
    const concurrencyLimit = parseInt(form.get("concurrencyLimit") as string, 10);

    const body = {
      name: form.get("name") as string,
      slug: form.get("slug") as string,
      description: (form.get("description") as string) || undefined,
      schedule: schedule || (form.get("schedule") as string),
      timezone: (form.get("timezone") as string) || "UTC",
      url: form.get("url") as string,
      method: (form.get("method") as string) || "POST",
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: (form.get("body") as string) || undefined,
      timeoutSeconds: parseInt(form.get("timeoutSeconds") as string, 10) || 30,
      tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [],
      ...(successStatusCodes && { successStatusCodes }),
      ...(showAdvanced && {
        ...(maxRetries >= 0 && !isNaN(maxRetries) && { maxRetries }),
        ...(retryDelaySeconds > 0 && !isNaN(retryDelaySeconds) && { retryDelaySeconds }),
        ...(!isNaN(retryBackoffMultiplier) && retryBackoffMultiplier > 0 && { retryBackoffMultiplier }),
        ...(retryMaxDelaySeconds > 0 && !isNaN(retryMaxDelaySeconds) && { retryMaxDelaySeconds }),
        ...(concurrencyLimit > 0 && !isNaN(concurrencyLimit) && { concurrencyLimit }),
        ...((form.get("concurrencyPolicy") as string) && { concurrencyPolicy: form.get("concurrencyPolicy") as string }),
      }),
      ...((form.get("monitorId") as string)?.trim() && { monitorId: (form.get("monitorId") as string).trim() }),
    };

    try {
      const job = await api<Job>("/api/v1/jobs", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreated(job);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">New Job</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Basic Info */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Basic Info
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cj-name">Name</Label>
                <Input
                  id="cj-name"
                  name="name"
                  placeholder="Job name"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cj-slug">Slug</Label>
                <Input
                  id="cj-slug"
                  name="slug"
                  placeholder="job-slug"
                  required
                  pattern="^[a-z0-9-]+$"
                  className="font-mono"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cj-description">Description</Label>
                <textarea
                  id="cj-description"
                  name="description"
                  placeholder="Optional description of what this job does"
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cj-tags">Tags</Label>
                <Input
                  id="cj-tags"
                  name="tags"
                  placeholder="Tags (comma-separated)"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* HTTP Configuration */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              HTTP Configuration
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cj-url">URL</Label>
                <Input
                  id="cj-url"
                  name="url"
                  type="url"
                  placeholder="https://example.com/webhook"
                  required
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cj-method">Method</Label>
                <select
                  id="cj-method"
                  name="method"
                  defaultValue="POST"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cj-timeout">Timeout (seconds)</Label>
                <Input
                  id="cj-timeout"
                  name="timeoutSeconds"
                  type="number"
                  defaultValue={30}
                  min={1}
                  max={300}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cj-headers">
                  Headers <span className="text-muted-foreground font-normal">(JSON)</span>
                </Label>
                <textarea
                  id="cj-headers"
                  name="headers"
                  placeholder={'{"Content-Type": "application/json", "Authorization": "Bearer ..."}'}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 resize-y"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cj-body">Request Body</Label>
                <textarea
                  id="cj-body"
                  name="body"
                  placeholder="Optional request body"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 resize-y"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cj-success-codes">
                  Success Status Codes <span className="text-muted-foreground font-normal">(comma-separated)</span>
                </Label>
                <Input
                  id="cj-success-codes"
                  name="successStatusCodes"
                  placeholder="200, 201, 202, 204"
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Schedule */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Schedule
            </p>
            <div className="space-y-3">
              <CronBuilder value={schedule} onChange={setSchedule} />
              <input type="hidden" name="schedule" value={schedule} />
              <div className="space-y-1.5">
                <Label htmlFor="cj-timezone">Timezone</Label>
                <select
                  id="cj-timezone"
                  name="timezone"
                  defaultValue="UTC"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Advanced Toggle */}
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {showAdvanced ? "Hide advanced" : "Show advanced"}
          </button>

          {showAdvanced && (
            <div className="space-y-5">
              <Separator />

              {/* Retry Policy */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Retry Policy
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cj-max-retries">Max Retries</Label>
                    <Input
                      id="cj-max-retries"
                      name="maxRetries"
                      type="number"
                      defaultValue={0}
                      min={0}
                      max={10}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cj-retry-delay">Retry Delay (seconds)</Label>
                    <Input
                      id="cj-retry-delay"
                      name="retryDelaySeconds"
                      type="number"
                      defaultValue={60}
                      min={1}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cj-retry-backoff">Backoff Multiplier</Label>
                    <Input
                      id="cj-retry-backoff"
                      name="retryBackoffMultiplier"
                      type="number"
                      defaultValue={2}
                      min={1}
                      max={10}
                      step={0.5}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cj-retry-max-delay">Max Delay (seconds)</Label>
                    <Input
                      id="cj-retry-max-delay"
                      name="retryMaxDelaySeconds"
                      type="number"
                      defaultValue={3600}
                      min={1}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Concurrency */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Concurrency
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cj-concurrency-limit">Concurrency Limit</Label>
                    <Input
                      id="cj-concurrency-limit"
                      name="concurrencyLimit"
                      type="number"
                      defaultValue={1}
                      min={1}
                      max={100}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cj-concurrency-policy">Concurrency Policy</Label>
                    <select
                      id="cj-concurrency-policy"
                      name="concurrencyPolicy"
                      defaultValue="queue"
                      className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30"
                    >
                      <option value="queue">Queue</option>
                      <option value="skip">Skip</option>
                      <option value="cancel">Cancel</option>
                    </select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Linked Monitor */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Linked Monitor
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="cj-monitor-id">
                    Monitor ID <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="cj-monitor-id"
                    name="monitorId"
                    placeholder="e.g. clx123..."
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-critical">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Creating..." : "Create Job"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
