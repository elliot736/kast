"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { WorkflowStepDefinition } from "@/lib/api";
import {
  Zap,
  Moon,
  GitBranch,
  ArrowUp,
  ArrowDown,
  Pause,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

// ── Step type options ───────────────────────────────────────

interface StepOption {
  type: WorkflowStepDefinition["type"];
  icon: LucideIcon;
  label: string;
}

const STEP_OPTIONS: StepOption[] = [
  { type: "run", icon: Zap, label: "HTTP Request" },
  { type: "sleep", icon: Moon, label: "Sleep" },
  { type: "spawn", icon: GitBranch, label: "Spawn" },
  { type: "signal_parent", icon: ArrowUp, label: "Signal Parent" },
  { type: "signal_child", icon: ArrowDown, label: "Signal Child" },
  { type: "wait_for_signal", icon: Pause, label: "Wait Signal" },
  { type: "fan_out", icon: GitBranch, label: "Fan Out" },
];

// ── Add step menu ───────────────────────────────────────────

export function AddStepMenu({
  onAdd,
  children,
}: {
  onAdd: (type: WorkflowStepDefinition["type"]) => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button variant="outline" size="xs">
            <Plus className="size-3" />
            Add Step
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" side="bottom" align="center">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
          Add a step
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

// ── Inline "+" button between nodes ─────────────────────────

export function InsertStepButton({
  onAdd,
}: {
  onAdd: (type: WorkflowStepDefinition["type"]) => void;
}) {
  return (
    <AddStepMenu onAdd={onAdd}>
      <button
        type="button"
        className="group flex items-center justify-center w-6 h-6 rounded-full border bg-card text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
      >
        <Plus className="size-3" />
      </button>
    </AddStepMenu>
  );
}
