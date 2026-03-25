"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { CommandPalette } from "@/components/command-palette";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Menu, Activity } from "lucide-react";
import { api, type DashboardStats } from "@/lib/api";

const AUTH_ROUTES = ["/login", "/signup"];

function useDocumentTitle() {
  const [openIncidents, setOpenIncidents] = useState(0);
  const pathname = usePathname();

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

  useEffect(() => {
    const base = "Kast";
    const prefix = openIncidents > 0 ? `(${openIncidents}) ` : "";

    const pageTitles: Record<string, string> = {
      "/": "Dashboard",
      "/monitors": "Monitors",
      "/incidents": "Incidents",
      "/stream": "Live Stream",
      "/replay": "Replay",
      "/dead-letters": "Dead Letters",
      "/settings": "Settings",
      "/settings/alerts": "Alerts",
      "/settings/teams": "Teams",
    };

    const pageTitle = pageTitles[pathname] ?? "";
    document.title = `${prefix}${pageTitle ? `${pageTitle} — ` : ""}${base}`;
  }, [pathname, openIncidents]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = AUTH_ROUTES.includes(pathname);

  useDocumentTitle();

  if (isAuth) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:block shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile header */}
        <div className="md:hidden sticky top-0 z-40 flex items-center gap-3 px-4 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[200px]">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Sidebar />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-primary/10 flex items-center justify-center border border-primary/20">
              <Activity className="size-3 text-primary" />
            </div>
            <span className="font-heading text-sm font-semibold tracking-tight">Kast</span>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 md:px-6 py-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>

      <CommandPalette />
    </div>
  );
}
