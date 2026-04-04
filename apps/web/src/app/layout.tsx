import type { Metadata } from "next";
import "./globals.css";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Kast — Job & Pipeline Monitor",
  description: "Open-source event-driven job monitoring",
};

// Inline script to set theme before first paint (prevents flash)
const themeScript = `
  (function() {
    try {
      var t = localStorage.getItem('kast-theme');
      var d = (!t || t === 'system')
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : t;
      document.documentElement.classList.add(d);
    } catch(e) {
      document.documentElement.classList.add('dark');
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <NuqsAdapter>
            <AppShell>{children}</AppShell>
          </NuqsAdapter>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
