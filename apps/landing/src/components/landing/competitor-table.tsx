"use client";

import { Check, X } from "lucide-react";

const features = [
  { name: "Open source", kast: true, cronitor: false, healthchecks: true },
  { name: "Self-hostable", kast: true, cronitor: false, healthchecks: true },
  { name: "Event streaming", kast: true, cronitor: false, healthchecks: false },
  { name: "Replay incidents", kast: true, cronitor: false, healthchecks: false },
  { name: "Live dashboard (zero-poll)", kast: true, cronitor: true, healthchecks: false },
  { name: "Runtime duration tracking", kast: true, cronitor: true, healthchecks: false },
  { name: "Modern stack", kast: true, cronitor: false, healthchecks: false },
];

const prices = {
  kast: "Free forever",
  cronitor: "$21–$449/mo",
  healthchecks: "$20/mo",
};

function CheckIcon() {
  return <Check className="w-4 h-4 text-[#00E5C3]" strokeWidth={3} />;
}

function XIcon() {
  return <X className="w-4 h-4 text-[#FF4444]/50" strokeWidth={2} />;
}

export function CompetitorTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1C2128]">
            <th className="text-left py-3 pr-4 text-[#8B949E] font-normal text-xs uppercase tracking-wider">
              Feature
            </th>
            <th className="text-center py-3 px-4 font-mono text-[#00E5C3] font-bold text-sm">
              Kast
            </th>
            <th className="text-center py-3 px-4 text-[#8B949E] font-normal text-sm">
              Cronitor
            </th>
            <th className="text-center py-3 px-4 text-[#8B949E] font-normal text-sm">
              Healthchecks.io
            </th>
          </tr>
        </thead>
        <tbody>
          {features.map((f) => (
            <tr key={f.name} className="border-b border-[#1C2128]/50">
              <td className="py-3 pr-4 text-[#E6EDF3] text-[13px]">
                {f.name}
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex justify-center">
                  {f.kast ? <CheckIcon /> : <XIcon />}
                </div>
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex justify-center">
                  {f.cronitor ? <CheckIcon /> : <XIcon />}
                </div>
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex justify-center">
                  {f.healthchecks ? <CheckIcon /> : <XIcon />}
                </div>
              </td>
            </tr>
          ))}
          <tr className="border-t border-[#1C2128]">
            <td className="py-3 pr-4 text-[#E6EDF3] text-[13px] font-medium">
              Price
            </td>
            <td className="py-3 px-4 text-center font-mono text-[#00E5C3] text-xs font-bold">
              {prices.kast}
            </td>
            <td className="py-3 px-4 text-center text-[#8B949E] text-xs">
              {prices.cronitor}
            </td>
            <td className="py-3 px-4 text-center text-[#8B949E] text-xs">
              {prices.healthchecks}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
