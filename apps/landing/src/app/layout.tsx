import type { Metadata } from "next";
import { Syne, JetBrains_Mono } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kast | Event-driven job monitoring",
  description:
    "Open-source, self-hosted monitoring for cron jobs, pipelines, and background tasks. Built on event streaming.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body>
        <RootProvider
          theme={{
            enabled: true,
            defaultTheme: "dark",
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
