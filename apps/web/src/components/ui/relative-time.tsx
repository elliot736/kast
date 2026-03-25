"use client";

import { timeAgo } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RelativeTimeProps {
  date: string | null;
  className?: string;
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  if (!date) {
    return <span className={className}>Never</span>;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className}>{timeAgo(date)}</span>
        </TooltipTrigger>
        <TooltipContent className="text-xs font-mono tabular-nums">
          {new Date(date).toLocaleString()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
