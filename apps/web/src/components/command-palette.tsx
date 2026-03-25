"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Monitor,
  AlertTriangle,
  Radio,
  RotateCcw,
  MailX,
  Settings,
  Bell,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type Monitor as MonitorType } from "@/lib/api";

const navigationItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Monitors", href: "/monitors", icon: Monitor },
  { label: "Incidents", href: "/incidents", icon: AlertTriangle },
  { label: "Live Stream", href: "/stream", icon: Radio },
  { label: "Replay", href: "/replay", icon: RotateCcw },
  { label: "Dead Letters", href: "/dead-letters", icon: MailX },
];

const settingsItems = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Alerts", href: "/settings/alerts", icon: Bell },
  { label: "Teams", href: "/settings/teams", icon: Users },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [monitors, setMonitors] = useState<MonitorType[]>([]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      api<MonitorType[]>("/api/v1/monitors")
        .then(setMonitors)
        .catch(() => {});
    }
  }, [open]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div
            className={cn(
              "relative z-10 w-full max-w-[520px] overflow-hidden rounded-xl",
              "border border-[var(--color-border,#1C2128)]",
              "bg-[var(--color-card,#0D1117)]",
              "shadow-2xl shadow-black/40",
            )}
          >
            <Command
              className="flex flex-col"
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            >
              {/* Search input */}
              <div className="flex items-center border-b border-[var(--color-border,#1C2128)] px-4">
                <Command.Input
                  autoFocus
                  placeholder="Where do you want to go?"
                  className={cn(
                    "flex-1 bg-transparent py-3.5 text-sm outline-none",
                    "text-[var(--color-foreground,#E6EDF3)]",
                    "placeholder:text-[var(--color-muted-foreground,#8B949E)]",
                  )}
                />
                <kbd
                  className={cn(
                    "ml-2 inline-flex h-5 items-center rounded px-1.5",
                    "border border-[var(--color-border,#1C2128)]",
                    "bg-[var(--color-border,#1C2128)]/40",
                    "text-[10px] font-medium text-[var(--color-muted-foreground,#8B949E)]",
                  )}
                >
                  ⌘K
                </kbd>
              </div>

              {/* Results */}
              <Command.List className="max-h-[320px] overflow-y-auto p-2">
                <Command.Empty className="px-4 py-8 text-center text-sm text-[var(--color-muted-foreground,#8B949E)]">
                  No results found.
                </Command.Empty>

                <Command.Group
                  heading="Navigation"
                  className={cn(
                    "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
                    "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium",
                    "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest",
                    "[&_[cmdk-group-heading]]:text-[var(--color-muted-foreground,#8B949E)]",
                  )}
                >
                  {navigationItems.map((item) => (
                    <Command.Item
                      key={item.href}
                      value={item.label}
                      onSelect={() => navigate(item.href)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
                        "text-[var(--color-foreground,#E6EDF3)]",
                        "data-[selected=true]:bg-[var(--color-primary,#00E5C3)]/10",
                        "data-[selected=true]:text-[var(--color-primary,#00E5C3)]",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {item.label}
                      <span className="ml-auto text-[11px] text-[var(--color-muted-foreground,#8B949E)]">
                        {item.href}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>

                {monitors.length > 0 && (
                  <>
                    <Command.Separator className="my-1.5 h-px bg-[var(--color-border,#1C2128)]" />
                    <Command.Group
                      heading="Monitors"
                      className={cn(
                        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
                        "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium",
                        "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest",
                        "[&_[cmdk-group-heading]]:text-[var(--color-muted-foreground,#8B949E)]",
                      )}
                    >
                      {monitors.map((m) => (
                        <Command.Item
                          key={m.id}
                          value={`${m.name} ${m.slug}`}
                          onSelect={() => navigate(`/monitors/${m.id}`)}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
                            "text-[var(--color-foreground,#E6EDF3)]",
                            "data-[selected=true]:bg-[var(--color-primary,#00E5C3)]/10",
                            "data-[selected=true]:text-[var(--color-primary,#00E5C3)]",
                          )}
                        >
                          <span className={cn(
                            "size-2 rounded-full shrink-0",
                            m.status === "healthy" ? "bg-[#00E5C3]" :
                            m.status === "late" ? "bg-[#F59E0B]" :
                            m.status === "down" ? "bg-[#FF4444]" : "bg-[#6E7681]"
                          )} />
                          {m.name}
                          <span className="ml-auto text-[11px] text-[var(--color-muted-foreground,#8B949E)] font-mono">
                            {m.slug}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  </>
                )}

                <Command.Separator className="my-1.5 h-px bg-[var(--color-border,#1C2128)]" />

                <Command.Group
                  heading="Settings"
                  className={cn(
                    "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
                    "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium",
                    "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest",
                    "[&_[cmdk-group-heading]]:text-[var(--color-muted-foreground,#8B949E)]",
                  )}
                >
                  {settingsItems.map((item) => (
                    <Command.Item
                      key={item.href}
                      value={item.label}
                      onSelect={() => navigate(item.href)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
                        "text-[var(--color-foreground,#E6EDF3)]",
                        "data-[selected=true]:bg-[var(--color-primary,#00E5C3)]/10",
                        "data-[selected=true]:text-[var(--color-primary,#00E5C3)]",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {item.label}
                      <span className="ml-auto text-[11px] text-[var(--color-muted-foreground,#8B949E)]">
                        {item.href}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
