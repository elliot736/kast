"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { NodeType } from "@/lib/api";
import {
  Zap,
  Moon,
  GitFork,
  Pause,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect } from "react";

// ── Step type options ───────────────────────────────────────

interface StepOption {
  type: NodeType;
  icon: LucideIcon;
  label: string;
}

const STEP_OPTIONS: StepOption[] = [
  { type: "run", icon: Zap, label: "HTTP Request" },
  { type: "sleep", icon: Moon, label: "Sleep" },
  { type: "condition", icon: GitFork, label: "Condition" },
];

// ── Add step menu ───────────────────────────────────────────

export function AddStepMenu({
  onAdd,
  children,
  defaultOpen = false,
  onClose,
}: {
  onAdd: (type: NodeType) => void;
  children?: React.ReactNode;
  defaultOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) onClose?.();
  };

  // If no children and defaultOpen, render as a standalone popover anchored at position
  if (!children && defaultOpen) {
    return (
      <div className="w-[220px] p-2 rounded-lg border bg-card shadow-xl">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
          Add a node
        </p>
        <div className="grid grid-cols-2 gap-1">
          {STEP_OPTIONS.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              type="button"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-left"
              onClick={() => {
                onAdd(type);
                onClose?.();
              }}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-2" side="bottom" align="center">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
          Add a node
        </p>
        <div className="grid grid-cols-2 gap-1">
          {STEP_OPTIONS.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              type="button"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-left"
              onClick={() => {
                onAdd(type);
                setOpen(false);
                onClose?.();
              }}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
