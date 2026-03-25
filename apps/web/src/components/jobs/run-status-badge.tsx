import { Badge } from "@/components/ui/badge";

const statusConfig = {
  scheduled: {
    label: "Scheduled",
    dot: "bg-neutral",
    className: "bg-neutral/10 text-neutral border-neutral/20",
  },
  running: {
    label: "Running",
    dot: "bg-warn",
    className: "bg-warn/10 text-warn border-warn/20",
  },
  success: {
    label: "Success",
    dot: "bg-alive",
    className: "bg-alive/10 text-alive border-alive/20",
  },
  failed: {
    label: "Failed",
    dot: "bg-critical",
    className: "bg-critical/10 text-critical border-critical/20",
  },
  timeout: {
    label: "Timeout",
    dot: "bg-critical",
    className: "bg-critical/10 text-critical border-critical/20",
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-neutral",
    className: "bg-neutral/10 text-neutral border-neutral/20",
  },
} as const;

export function RunStatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
      <span className={`size-1.5 rounded-full ${config.dot} ${status === "running" ? "animate-pulse-dot" : ""}`} />
      {config.label}
    </Badge>
  );
}
