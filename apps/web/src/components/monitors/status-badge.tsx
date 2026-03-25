import { Badge } from "@/components/ui/badge";

const statusConfig = {
  healthy: {
    label: "Healthy",
    dot: "bg-alive",
    className: "bg-alive/10 text-alive border-alive/20",
  },
  late: {
    label: "Late",
    dot: "bg-warn",
    className: "bg-warn/10 text-warn border-warn/20",
  },
  down: {
    label: "Down",
    dot: "bg-critical",
    className: "bg-critical/10 text-critical border-critical/20",
  },
  paused: {
    label: "Paused",
    dot: "bg-neutral",
    className: "bg-neutral/10 text-neutral border-neutral/20",
  },
} as const;

export function StatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
      <span className={`size-1.5 rounded-full ${config.dot} ${status === "healthy" ? "animate-pulse-dot" : ""}`} />
      {config.label}
    </Badge>
  );
}
