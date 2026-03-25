"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

interface DateTimePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  label?: string;
  placeholder?: string;
}

export function DateTimePicker({
  value,
  onChange,
  label,
  placeholder = "Pick date & time",
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const hours = value ? value.getHours().toString().padStart(2, "0") : "";
  const minutes = value ? value.getMinutes().toString().padStart(2, "0") : "";

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) {
      onChange(undefined);
      return;
    }
    const next = new Date(day);
    if (value) {
      next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    }
    onChange(next);
  };

  const handleTimeChange = (type: "hours" | "minutes", val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num)) return;
    const base = value ? new Date(value) : new Date();
    if (!value) {
      base.setHours(0, 0, 0, 0);
    }
    if (type === "hours" && num >= 0 && num <= 23) {
      base.setHours(num);
    } else if (type === "minutes" && num >= 0 && num <= 59) {
      base.setMinutes(num);
    }
    onChange(base);
  };

  return (
    <div className="space-y-1.5">
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "w-full justify-start text-left font-mono text-xs",
              !value && "text-muted-foreground/60"
            )}
          >
            <CalendarIcon className="size-3.5 shrink-0" />
            {value ? format(value, "MMM d, yyyy  HH:mm") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDateSelect}
            initialFocus
          />
          <div className="border-t border-border px-3 py-3">
            <Label className="text-[11px] text-muted-foreground mb-2">Time</Label>
            <div className="flex items-center gap-1.5 mt-1.5">
              <Input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => handleTimeChange("hours", e.target.value)}
                placeholder="HH"
                className="w-14 text-center font-mono text-xs"
              />
              <span className="text-muted-foreground text-sm">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => handleTimeChange("minutes", e.target.value)}
                placeholder="MM"
                className="w-14 text-center font-mono text-xs"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
