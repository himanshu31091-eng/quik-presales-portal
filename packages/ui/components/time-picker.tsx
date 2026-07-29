"use client";

/**
 * Time picker — replaces native <input type="time">.
 * 3-column wheel (hour / minute / period) with AM/PM toggle.
 *
 * Stored value is HH:mm (24h). Display shows 12h with period.
 */

import { useEffect, useRef, useState } from "react";
import { Clock as ClockIcon } from "lucide-react";

export interface TimePickerProps {
  /** HH:mm 24h. Empty string when unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Minute step (default 5). */
  step?: number;
  className?: string;
}

function parse24(v: string): { h: number; m: number } | null {
  if (!v || !/^\d{2}:\d{2}$/.test(v)) return null;
  const [hStr, mStr] = v.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function display12(v: string): string {
  const p = parse24(v);
  if (!p) return "";
  const period = p.h >= 12 ? "PM" : "AM";
  const h12 = p.h === 0 ? 12 : p.h > 12 ? p.h - 12 : p.h;
  return `${h12}:${String(p.m).padStart(2, "0")} ${period}`;
}

export function TimePicker({ value, onChange, placeholder = "Select time", disabled, step = 5, className = "" }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Internal draft state — committed to onChange when user clicks Set.
  const initial = parse24(value) ?? { h: 12, m: 0 };
  const [hour12, setHour12] = useState(() => {
    const h = initial.h;
    return h === 0 ? 12 : h > 12 ? h - 12 : h;
  });
  const [minute, setMinute] = useState(() => initial.m);
  const [period, setPeriod] = useState<"AM" | "PM">(() => (initial.h >= 12 ? "PM" : "AM"));

  // Re-sync draft from value when popup opens.
  useEffect(() => {
    if (!open) return;
    const p = parse24(value);
    if (p) {
      setHour12(p.h === 0 ? 12 : p.h > 12 ? p.h - 12 : p.h);
      setMinute(p.m);
      setPeriod(p.h >= 12 ? "PM" : "AM");
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function commit(h12: number, m: number, p: "AM" | "PM") {
    let h24 = h12 % 12;
    if (p === "PM") h24 += 12;
    onChange(`${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }

  const hours = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
  const minutes: number[] = [];
  for (let m = 0; m < 60; m += step) minutes.push(m);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 ${
          disabled
            ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-70"
            : "border-gray-200 hover:bg-gray-50 text-gray-800"
        }`}
      >
        <span className={value ? "" : "text-gray-400"}>{value ? display12(value) : placeholder}</span>
        <ClockIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3" style={{ minWidth: 240 }}>
          <div className="flex items-stretch justify-center gap-2">
            <Wheel values={hours} value={hour12} onChange={(v) => { setHour12(v); commit(v, minute, period); }} pad={2} />
            <span className="self-center text-base font-semibold text-gray-400">:</span>
            <Wheel values={minutes} value={minute} onChange={(v) => { setMinute(v); commit(hour12, v, period); }} pad={2} />
            <div className="flex flex-col rounded-md border border-gray-200 overflow-hidden">
              {(["AM", "PM"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setPeriod(p); commit(hour12, minute, p); }}
                  className={`px-3 py-1 text-xs font-medium ${
                    period === p ? "bg-accent-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  } ${p === "AM" ? "border-b border-gray-200" : ""}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 text-[11px]">
            <button type="button"
              onClick={() => {
                const now = new Date();
                const h = now.getHours();
                const m = Math.round(now.getMinutes() / step) * step;
                const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                const p: "AM" | "PM" = h >= 12 ? "PM" : "AM";
                setHour12(h12); setMinute(m % 60); setPeriod(p);
                commit(h12, m % 60, p);
              }}
              className="text-accent-600 hover:underline font-medium">Now</button>
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              className="text-gray-500 hover:underline">Clear</button>
            <button type="button" onClick={() => setOpen(false)}
              className="text-accent-600 hover:underline font-medium">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Wheel({ values, value, onChange, pad }: { values: number[]; value: number; onChange: (v: number) => void; pad: number }) {
  const idx = values.indexOf(value);
  const prev = idx > 0 ? values[idx - 1] : values[values.length - 1];
  const next = idx < values.length - 1 ? values[idx + 1] : values[0];

  return (
    <div className="flex flex-col items-center select-none">
      <button type="button" onClick={() => onChange(prev)}
        className="text-[11px] text-gray-400 hover:text-gray-600 px-2">▲</button>
      <div className="flex flex-col items-center justify-center h-[68px] w-12 my-1">
        <span className="text-[11px] text-gray-300">{String(prev).padStart(pad, "0")}</span>
        <span className="text-base font-semibold bg-accent-500 text-white px-2 py-0.5 rounded my-0.5">
          {String(value).padStart(pad, "0")}
        </span>
        <span className="text-[11px] text-gray-300">{String(next).padStart(pad, "0")}</span>
      </div>
      <button type="button" onClick={() => onChange(next)}
        className="text-[11px] text-gray-400 hover:text-gray-600 px-2">▼</button>
    </div>
  );
}
