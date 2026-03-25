import { Badge } from "@/components/ui/badge";

const statusConfig = {
  active: {
    label: "Active",
    dot: "bg-alive",
    className: "bg-alive/10 text-alive border-alive/20",
  },
  paused: {
    label: "Paused",
    dot: "bg-neutral",
    className: "bg-neutral/10 text-neutral border-neutral/20",
  },
  disabled: {
    label: "Disabled",
    dot: "bg-neutral",
    className: "bg-neutral/10 text-neutral border-neutral/20",
  },
} as const;

export function JobStatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
      <span className={`size-1.5 rounded-full ${config.dot} ${status === "active" ? "animate-pulse-dot" : ""}`} />
      {config.label}
    </Badge>
  );
}
