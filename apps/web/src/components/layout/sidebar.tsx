"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Monitor, AlertTriangle, Radio, RotateCcw,
  MailX, Settings, Bell, Users, LogOut, Activity, Search, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth-client";
import { api, type DashboardStats } from "@/lib/api";

const mainNav = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Monitors", href: "/monitors", icon: Monitor },
  { label: "Jobs", href: "/jobs", icon: Zap },
  { label: "Incidents", href: "/incidents", icon: AlertTriangle, badgeKey: "incidents" as const },
  { label: "Live Stream", href: "/stream", icon: Radio },
  { label: "Replay", href: "/replay", icon: RotateCcw },
  { label: "Dead Letters", href: "/dead-letters", icon: MailX },
];

const settingsNav = [
  { label: "General", href: "/settings", icon: Settings },
  { label: "Alerts", href: "/settings/alerts", icon: Bell },
  { label: "Teams", href: "/settings/teams", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [openIncidents, setOpenIncidents] = useState(0);

  useEffect(() => {
    api<DashboardStats>("/api/v1/dashboard")
      .then((s) => setOpenIncidents(s.openIncidents))
      .catch(() => {});

    const interval = setInterval(() => {
      api<DashboardStats>("/api/v1/dashboard")
        .then((s) => setOpenIncidents(s.openIncidents))
        .catch(() => {});
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <aside className="w-[200px] h-screen border-r border-border bg-sidebar flex flex-col">
      {/* Brand */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:border-primary/40 transition-colors">
            <Activity className="size-3.5 text-primary" />
          </div>
          <span className="font-heading text-sm font-semibold tracking-tight">
            Kast
          </span>
        </Link>
      </div>

      <ScrollArea className="flex-1 px-2 py-3">
        {/* Search / Cmd+K trigger */}
        <button
          type="button"
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          className="flex items-center gap-2 w-full rounded-md border border-border bg-surface/50 px-2.5 py-1.5 mb-3 text-[12px] text-muted-foreground/60 hover:text-muted-foreground hover:border-primary/20 transition-colors"
        >
          <Search className="size-3" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="hidden sm:inline-flex h-4 items-center rounded px-1 border border-border bg-background text-[9px] font-mono text-muted-foreground/50">
            ⌘K
          </kbd>
        </button>

        <nav className="space-y-0.5">
          {mainNav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const showBadge = item.badgeKey === "incidents" && openIncidents > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors relative ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="size-4 rounded-full bg-critical/15 text-critical text-[9px] font-semibold inline-flex items-center justify-center tabular-nums">
                    {openIncidents}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <Separator className="my-3" />

        <p className="px-2.5 mb-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
          Settings
        </p>
        <nav className="space-y-0.5">
          {settingsNav.map((item) => {
            const active = item.href === "/settings" ? pathname === "/settings" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="border-t border-border px-2 py-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-muted-foreground hover:text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="size-3.5 mr-2" />
          Sign out
        </Button>
        <ThemeToggle />
      </div>
    </aside>
  );
}
