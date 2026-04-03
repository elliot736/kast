import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: (
          <span
             
            className="text-sm font-bold tracking-[0.2em] uppercase"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            KAST
          </span>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
