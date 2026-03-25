"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Bell, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "General", href: "/settings", icon: Settings },
  { label: "Alerts", href: "/settings/alerts", icon: Bell },
  { label: "Teams", href: "/settings/teams", icon: Users },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-border pb-3 mb-5 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.href === "/settings"
          ? pathname === "/settings"
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <tab.icon className="size-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
