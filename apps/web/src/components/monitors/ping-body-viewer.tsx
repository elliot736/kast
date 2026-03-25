"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

function tryParseJson(str: string): object | null {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function PingBodyViewer({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = tryParseJson(body);

  if (!expanded) {
    return (
      <Button
        variant="link"
        size="xs"
        className="text-muted-foreground h-auto p-0"
        onClick={() => setExpanded(true)}
      >
        View output ({body.length} chars)
      </Button>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-muted-foreground">
          {parsed ? "JSON" : "Plain text"}
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="h-auto py-0.5"
          onClick={() => setExpanded(false)}
        >
          Collapse
        </Button>
      </div>
      <ScrollArea className="max-h-64">
        <pre className="text-[11px] bg-background border border-border rounded-lg p-3 overflow-x-auto font-mono text-muted-foreground">
          {parsed ? JSON.stringify(parsed, null, 2) : body}
        </pre>
      </ScrollArea>
    </div>
  );
}
