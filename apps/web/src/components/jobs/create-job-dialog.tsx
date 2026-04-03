"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CronBuilder } from "@/components/ui/cron-builder";
import { api, type Job } from "@/lib/api";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function CreateJobForm({
  onCreated,
  onCancel,
}: {
  onCreated: (job: Job) => void;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  // Auto-generate slug from name unless manually edited
  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(name));
    }
  }, [name, slugTouched]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const tagsRaw = (form.get("tags") as string) || "";

    const body = {
      name,
      slug: slug || slugify(name),
      schedule: schedule || (form.get("schedule") as string),
      tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [],
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cj-name">Name</Label>
            <Input
              id="cj-name"
              name="name"
              placeholder="Weekly Report"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cj-slug">Slug</Label>
            <Input
              id="cj-slug"
              name="slug"
              placeholder="weekly-report"
              required
              pattern="^[a-z0-9-]+$"
              className="font-mono text-sm"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Schedule</Label>
            <CronBuilder value={schedule} onChange={setSchedule} />
            <input type="hidden" name="schedule" value={schedule} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cj-tags">Tags</Label>
            <Input
              id="cj-tags"
              name="tags"
              placeholder="backend, reports (comma-separated)"
            />
          </div>

          {error && (
            <p className="text-sm text-critical">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !name || !schedule}>
              {submitting ? "Creating..." : "Create Job"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
