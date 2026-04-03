"use client";

const events = [
  { time: "14:23:01", job: "db-backup", status: "ok", duration: "4.2s" },
  { time: "14:23:03", job: "invoice-sync", status: "ok", duration: "1.8s" },
  { time: "14:23:07", job: "email-digest", status: "fail", duration: "12.1s" },
  { time: "14:23:09", job: "thumbnail-gen", status: "ok", duration: "0.3s" },
  { time: "14:23:14", job: "daily-report", status: "ok", duration: "8.7s" },
  { time: "14:23:18", job: "cache-warmup", status: "ok", duration: "2.1s" },
  { time: "14:23:22", job: "log-rotate", status: "late", duration: "34.5s" },
  { time: "14:23:25", job: "sitemap-gen", status: "ok", duration: "1.2s" },
  { time: "14:23:31", job: "db-backup", status: "ok", duration: "4.0s" },
  { time: "14:23:34", job: "payment-sweep", status: "ok", duration: "0.9s" },
  { time: "14:23:38", job: "email-digest", status: "ok", duration: "3.4s" },
  { time: "14:23:41", job: "analytics-etl", status: "ok", duration: "15.2s" },
  { time: "14:23:45", job: "cert-renewal", status: "ok", duration: "0.4s" },
  { time: "14:23:49", job: "invoice-sync", status: "fail", duration: "—" },
  { time: "14:23:52", job: "thumbnail-gen", status: "ok", duration: "0.2s" },
  { time: "14:23:56", job: "daily-report", status: "ok", duration: "9.1s" },
  { time: "14:24:01", job: "db-vacuum", status: "ok", duration: "22.3s" },
  { time: "14:24:05", job: "queue-drain", status: "late", duration: "45.8s" },
  { time: "14:24:09", job: "db-backup", status: "ok", duration: "3.9s" },
  { time: "14:24:13", job: "health-check", status: "ok", duration: "0.1s" },
];

const statusClass: Record<string, string> = {
  ok: "text-[#00E5C3]",
  fail: "text-[#FF4444]",
  late: "text-[#F59E0B]",
};

const statusBg: Record<string, string> = {
  ok: "bg-[#00E5C3]/10 text-[#00E5C3] border-[#00E5C3]/20",
  fail: "bg-[#FF4444]/10 text-[#FF4444] border-[#FF4444]/20",
  late: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
};

function EventLine({ event }: { event: (typeof events)[0] }) {
  return (
    <div className="flex items-center gap-3 py-1.5 px-3 text-[13px] font-mono whitespace-nowrap">
      <span className="text-[#8B949E]">{event.time}</span>
      <span className="text-[#E6EDF3] w-28 truncate">{event.job}</span>
      <span
        className={`inline-flex items-center rounded-none border px-1.5 py-0 text-[11px] leading-5 ${statusBg[event.status]}`}
      >
        {event.status.toUpperCase()}
      </span>
      <span className="text-[#8B949E] ml-auto">{event.duration}</span>
    </div>
  );
}

export function EventStream() {
  return (
    <div className="relative rounded-none border border-[#1C2128] bg-[#0D1117] glow-alive overflow-hidden">
      {/* Terminal bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1C2128] bg-[#080B0F]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF4444]/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#00E5C3]/80" />
        </div>
        <span className="text-[11px] font-mono text-[#8B949E] ml-2">
          kast event stream — live
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00E5C3] animate-pulse-alive" />
          <span className="text-[10px] font-mono text-[#00E5C3]">LIVE</span>
        </div>
      </div>

      {/* Scrolling events */}
      <div className="h-[340px] overflow-hidden">
        <div className="animate-scroll-up">
          {events.map((e, i) => (
            <EventLine key={`a-${i}`} event={e} />
          ))}
          {events.map((e, i) => (
            <EventLine key={`b-${i}`} event={e} />
          ))}
        </div>
      </div>
    </div>
  );
}
