"use client";

import { motion } from "framer-motion";
import {
  Bell,
  Clock,
  Code,
  Globe,
  Mail,
  MessageSquare,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Terminal,
  Zap,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EventStream } from "@/components/landing/event-stream";
import { IncidentReplay } from "@/components/landing/incident-replay";
import { CompetitorTable } from "@/components/landing/competitor-table";
import { CountUp } from "@/components/landing/count-up";
import { Section } from "@/components/landing/section";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

// Styled link helpers (replaces Button asChild)
function LinkBtn({
  href,
  children,
  className = "",
  target,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  target?: string;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={target === "_blank" ? "noopener noreferrer" : undefined}
      className={`inline-flex items-center justify-center transition-colors ${className}`}
    >
      {children}
    </a>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080B0F] text-[#E6EDF3] overflow-x-hidden">
      {/* ─── NAV ─── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-[#1C2128]/50 bg-[#080B0F]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span
            className="text-sm font-bold tracking-[0.25em] uppercase"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            KAST
          </span>
          <div className="flex items-center gap-3">
            <LinkBtn
              href="/docs"
              className="text-[#8B949E] hover:text-[#E6EDF3] text-xs px-3 py-1.5"
            >
              Docs
            </LinkBtn>
            <LinkBtn
              href="https://github.com/elliot736/kast"
              target="_blank"
              className="text-[#8B949E] hover:text-[#E6EDF3] text-xs px-3 py-1.5"
            >
              GitHub &#8599;
            </LinkBtn>
            <LinkBtn
              href="/docs/quickstart"
              className="border border-[#00E5C3] text-[#00E5C3] hover:bg-[#00E5C3]/10 text-xs px-4 py-1.5"
            >
              Get Started
            </LinkBtn>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.4fr_1fr] gap-12 items-start">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="space-y-6"
          >
            <motion.div variants={fadeUp}>
              <Badge className="rounded-none border-[#1C2128] bg-[#0D1117] text-[#8B949E] text-[11px] font-mono px-2.5 py-1 hover:bg-[#0D1117]">
                Event-stream native monitoring
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-5xl lg:text-[4.5rem] font-bold leading-[1.05] tracking-tight"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              Your jobs are
              <br />
              either{" "}
              <span className="text-[#00E5C3]">alive</span>{" "}
              <br className="hidden lg:block" />
              or they&apos;re not.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-[#8B949E] text-lg max-w-lg leading-relaxed"
            >
              Heartbeat pings flow into a durable event log. If a ping
              doesn&apos;t arrive on time, Kast alerts you instantly.
              Every event is replayable. Every incident is reconstructible.
            </motion.p>

            <motion.div variants={fadeUp} className="flex gap-3 pt-2">
              <LinkBtn
                href="/docs/quickstart"
                className="border border-[#00E5C3] text-[#00E5C3] hover:bg-[#00E5C3]/10 text-sm px-6 py-2.5"
              >
                Self-host in 5 minutes
                <ArrowRight className="ml-2 w-4 h-4" />
              </LinkBtn>
              <LinkBtn
                href="https://github.com/elliot736/kast"
                target="_blank"
                className="text-[#8B949E] hover:text-[#E6EDF3] text-sm px-4 py-2.5"
              >
                View on GitHub
              </LinkBtn>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="flex items-center gap-4 pt-4 text-[#8B949E]"
            >
              <span className="text-xs uppercase tracking-wider">
                Alerts via
              </span>
              <div className="flex gap-3">
                <MessageSquare className="w-4 h-4" />
                <Globe className="w-4 h-4" />
                <Bell className="w-4 h-4" />
                <Mail className="w-4 h-4" />
                <Radio className="w-4 h-4" />
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="hidden lg:block"
          >
            <EventStream />
          </motion.div>
        </div>
      </section>

      {/* ─── SOCIAL PROOF ─── */}
      <Section className="border-y border-[#1C2128] bg-[#0D1117]/30">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <p className="text-center text-[#8B949E] text-xs uppercase tracking-wider mb-8">
            Trusted by engineers who&apos;ve been paged at 3am
          </p>
          <div className="flex items-center justify-center gap-8 md:gap-16">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-[#E6EDF3]" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
                <CountUp target={12847} />
              </div>
              <div className="text-xs text-[#8B949E] mt-1">jobs monitored</div>
            </div>
            <Separator orientation="vertical" className="h-10 bg-[#1C2128]" />
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-[#E6EDF3]" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
                <CountUp target={99} suffix=".97%" />
              </div>
              <div className="text-xs text-[#8B949E] mt-1">alert delivery</div>
            </div>
            <Separator orientation="vertical" className="h-10 bg-[#1C2128]" />
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-[#E6EDF3]" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
                &lt; <CountUp target={30} suffix="s" />
              </div>
              <div className="text-xs text-[#8B949E] mt-1">detection time</div>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── HOW IT WORKS ─── */}
      <Section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-16"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Three steps. Zero blind spots.
          </h2>

          <div className="grid md:grid-cols-3 gap-0">
            {[
              {
                step: "01",
                title: "Your job pings Kast",
                description: "One curl at the end of your script. That\u2019s it.",
                code: "curl https://kast.yourdomain.com/ping/abc123",
                icon: Terminal,
              },
              {
                step: "02",
                title: "Events hit the log",
                description:
                  "Every ping is a durable event in Redpanda. Replayable. Queryable. Forever.",
                code: "ping-events \u2192 monitor-state \u2192 incident-events",
                icon: Server,
              },
              {
                step: "03",
                title: "Miss a ping? Get alerted.",
                description:
                  "Slack, Discord, PagerDuty, email, webhooks \u2014 under 30 seconds.",
                code: "alert-triggers \u2192 notify \u2192 slack.webhook",
                icon: Zap,
              },
            ].map((item, i) => (
              <div key={i} className="relative">
                <Card className="rounded-none border-[#1C2128] bg-[#0D1117] border-t-2 border-t-[#00E5C3] h-full">
                  <CardContent className="pt-6 pb-6 px-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-[10px] font-mono text-[#00E5C3] border border-[#00E5C3]/20 px-1.5 py-0.5">
                        {item.step}
                      </span>
                      <item.icon className="w-4 h-4 text-[#8B949E]" />
                    </div>
                    <h3 className="text-lg font-bold text-[#E6EDF3] mb-2">
                      {item.title}
                    </h3>
                    <p className="text-sm text-[#8B949E] mb-4 leading-relaxed">
                      {item.description}
                    </p>
                    <code
                      className="text-[11px] text-[#00E5C3]/70 bg-[#080B0F] border border-[#1C2128] px-2.5 py-1.5 block overflow-x-auto"
                      style={{ fontFamily: "var(--font-jetbrains), monospace" }}
                    >
                      {item.code}
                    </code>
                  </CardContent>
                </Card>
                {i < 2 && (
                  <div className="hidden md:flex absolute top-1/2 -right-3 z-10 text-[#1C2128]">
                    <ChevronRight className="w-6 h-6" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── DIFFERENTIATOR ─── */}
      <Section className="py-24 px-6 bg-[#0D1117]/40" delay={0.1}>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <Badge className="rounded-none border-[#1C2128] bg-[#0D1117] text-[#8B949E] text-[11px] font-mono px-2.5 py-1 mb-6 hover:bg-[#0D1117]">
              Built different
            </Badge>
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight mb-6 leading-tight"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              Every ping is an event.
              <br />
              <span className="text-[#00E5C3]">Every event is forever.</span>
            </h2>
            <p className="text-[#8B949E] leading-relaxed mb-8">
              Most monitors store snapshots. Kast stores the full event stream.
              Built on Redpanda (Kafka-compatible), every heartbeat, every state
              change, every alert is a durable, ordered, replayable event in a
              distributed log.
            </p>

            <div className="space-y-4">
              {[
                { icon: RefreshCw, title: "Replay any incident", desc: "Seek to any timestamp. See exactly what happened." },
                { icon: Clock, title: "Rewind your alert rules", desc: "Test new thresholds against real data. \u201CWould this have paged me last Tuesday?\u201D" },
                { icon: Radio, title: "Zero-poll live dashboard", desc: "Events stream from Redpanda to your browser via WebSocket. No polling." },
                { icon: Shield, title: "Backtest alert logic", desc: "Change grace periods, replay the event log, verify before deploying." },
              ].map((item, i) => (
                <div key={i} className="flex gap-3.5">
                  <div className="mt-0.5">
                    <item.icon className="w-4 h-4 text-[#00E5C3]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#E6EDF3]">{item.title}</p>
                    <p className="text-xs text-[#8B949E] mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <IncidentReplay />
          </div>
        </div>
      </Section>

      {/* ─── COMPETITOR TABLE ─── */}
      <Section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-4"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            How Kast compares
          </h2>
          <p className="text-center text-[#8B949E] mb-12">
            The honest comparison nobody else will make.
          </p>
          <CompetitorTable />
        </div>
      </Section>

      {/* ─── FEATURES GRID ─── */}
      <Section className="py-24 px-6 bg-[#0D1117]/40" delay={0.1}>
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-16"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Everything you need. Nothing you don&apos;t.
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-0">
            {[
              { icon: Bell, title: "Multi-channel alerts", desc: "Slack, Discord, PagerDuty, email, webhooks, Telegram. Route alerts per monitor." },
              { icon: RefreshCw, title: "Event replay", desc: "Select a time range. Replay all events. Reconstruct incidents without guessing." },
              { icon: Radio, title: "Zero-poll dashboard", desc: "Redpanda streams events to your browser over WebSocket. Instant. No refresh." },
              { icon: Server, title: "Self-hosted & private", desc: "Your infrastructure, your data. Docker Compose up and you\u2019re running." },
              { icon: Zap, title: "Redpanda-native", desc: "Kafka-compatible event backbone. Durable logs, compacted state, partition ordering." },
              { icon: Code, title: "Cron-aware scheduling", desc: "Understands cron expressions natively. Calculates expected ping windows automatically." },
            ].map((item, i) => (
              <Card key={i} className="rounded-none border-[#1C2128] bg-transparent hover:bg-[#0D1117] transition-colors">
                <CardContent className="p-6">
                  <item.icon className="w-5 h-5 text-[#00E5C3] mb-3" />
                  <h3 className="text-sm font-bold text-[#E6EDF3] mb-1.5">{item.title}</h3>
                  <p className="text-xs text-[#8B949E] leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── INTEGRATION STRIP ─── */}
      <Section className="py-16 px-6 border-y border-[#1C2128]">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-xs uppercase tracking-wider text-[#8B949E] mb-6">
            Works with your stack
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["Slack", "Discord", "PagerDuty", "Email", "Webhooks", "Redpanda", "Docker", "Kubernetes"].map((name) => (
              <Badge
                key={name}
                variant="outline"
                className="rounded-none border-[#1C2128] bg-[#0D1117] text-[#8B949E] text-xs px-3 py-1.5 hover:text-[#E6EDF3] hover:border-[#00E5C3]/30 transition-colors"
              >
                {name}
              </Badge>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── FINAL CTA ─── */}
      <Section className="py-28 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2
            className="text-3xl md:text-5xl font-bold tracking-tight mb-6 leading-tight"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Stop flying blind on your
            <br />
            <span className="text-[#00E5C3]">background jobs.</span>
          </h2>
          <p className="text-[#8B949E] mb-8">
            Clone the repo. Docker compose up. First alert in 5 minutes.
          </p>
          <div className="flex justify-center gap-3">
            <LinkBtn
              href="/docs/quickstart"
              className="border border-[#00E5C3] bg-[#00E5C3] text-[#080B0F] hover:bg-[#00E5C3]/90 text-sm px-8 py-2.5 font-bold"
            >
              Get Started
              <ArrowRight className="ml-2 w-4 h-4" />
            </LinkBtn>
            <LinkBtn
              href="https://github.com/elliot736/kast"
              target="_blank"
              className="text-[#8B949E] hover:text-[#E6EDF3] text-sm px-4 py-2.5"
            >
              Star on GitHub
            </LinkBtn>
          </div>
          <p className="text-xs text-[#8B949E]/60 mt-8">
            Open source &middot; MIT License &middot; Self-hosted &middot; No
            vendor lock-in
          </p>
        </div>
      </Section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-[#1C2128] py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span
            className="text-xs tracking-[0.2em] text-[#8B949E] uppercase"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            KAST
          </span>
          <div className="flex items-center gap-4 text-xs text-[#8B949E]/50">
            <a href="/docs" className="hover:text-[#8B949E] transition-colors">Docs</a>
            <a href="https://github.com/elliot736/kast" target="_blank" rel="noopener noreferrer" className="hover:text-[#8B949E] transition-colors">GitHub</a>
            <span>MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
