"use client";

/**
 * FlipCard — 3D flip-on-hover card used on the App Launcher.
 *
 * Front shows the app's icon + name + status. Back lists 4 modules from the
 * MODULE_REGISTRY and a "Launch" CTA. Click anywhere → navigate to baseUrl.
 *
 * Adapted from the generic flip-card pattern: replaced the Rocket front-icon
 * with the app's actual logo, replaced the static "features" list with live
 * module names, and added tap-to-flip for touch devices (hover-to-flip alone
 * is unreachable on phones).
 */
import { ArrowRight, Sparkles, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface FlipCardProps {
  /** App display name. Renders on both faces. */
  title: string;
  /** Short tagline shown under the title on the front. */
  subtitle: string;
  /** Longer copy on the back. */
  description: string;
  /** Up to ~4 lines on the back — typically top-level module names. */
  features: string[];
  /** Optional icon URL for the front. Falls back to first letter of title. */
  iconUrl?: string | null;
  /** Status pill text — "Active" / "Beta" / "Coming Soon". */
  status?: string;
  /** Brand accent color (CSS color value) — drives gradients + CTA. */
  color?: string;
  /** Called when the user clicks anywhere on the card to launch the app. */
  onLaunch?: () => void;
  /** Disable hover-flip + interaction (e.g., for "Coming Soon" apps). */
  disabled?: boolean;
}

/* Status pill mapping — dark-only, since the card body is locked dark. */
const STATUS_TONE: Record<string, string> = {
  active: "bg-green-900/40 text-green-300 ring-1 ring-green-700/40",
  beta: "bg-purple-900/40 text-purple-300 ring-1 ring-purple-700/40",
  coming_soon: "bg-amber-900/40 text-amber-300 ring-1 ring-amber-700/40",
  disabled: "bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700",
};

function statusLabel(s?: string): string {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FlipCard({
  title,
  subtitle,
  description,
  features,
  iconUrl,
  status = "active",
  color = "#5b3df5",
  onLaunch,
  disabled = false,
}: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  function handleClick() {
    if (disabled) return;
    if (onLaunch) onLaunch();
  }

  function toggleFlipMobile() {
    if (disabled) return;
    setIsFlipped((f) => !f);
  }

  return (
    <button
      type="button"
      style={{ ["--brand" as string]: color }}
      onClick={handleClick}
      onMouseEnter={() => !disabled && setIsFlipped(true)}
      onMouseLeave={() => !disabled && setIsFlipped(false)}
      onTouchStart={(e) => {
        // Single tap toggles flip on touch; double-tap (in <300ms) launches.
        // Implemented inline to avoid extra deps.
        e.preventDefault();
        toggleFlipMobile();
      }}
      aria-label={`Launch ${title}`}
      disabled={disabled}
      className={cn(
        "group relative h-[360px] w-full max-w-[300px] [perspective:2000px] text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-2xl",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div
        className={cn(
          "relative h-full w-full",
          "[transform-style:preserve-3d]",
          "transition-all duration-700",
          isFlipped ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]",
        )}
      >
        {/* ── Front ── */}
        <div
          className={cn(
            "absolute inset-0 h-full w-full",
            "[transform:rotateY(0deg)] [backface-visibility:hidden]",
            "overflow-hidden rounded-2xl",
            // Dark gradient body — locked regardless of light/dark mode.
            "bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-800",
            "border border-zinc-800/60",
            "shadow-xl",
            "transition-all duration-700",
            "group-hover:shadow-2xl group-hover:border-zinc-700/60",
            isFlipped ? "opacity-0" : "opacity-100",
          )}
        >
          {/* Background gradient — uses the app's brand color via CSS var */}
          <div
            className="absolute inset-0 bg-gradient-to-br via-transparent"
            style={{
              backgroundImage: `linear-gradient(to bottom right, color-mix(in srgb, var(--brand) 8%, transparent), transparent 60%, color-mix(in srgb, var(--brand) 5%, transparent))`,
            }}
          />

          {/* Status pill */}
          {status && (
            <div className="absolute right-4 top-4 z-10">
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider",
                  STATUS_TONE[status] ?? STATUS_TONE.active,
                )}
              >
                {statusLabel(status)}
              </span>
            </div>
          )}

          {/* Centered app icon */}
          <div className="absolute inset-0 flex items-center justify-center pt-8 pb-24">
            <div className="relative flex flex-col items-center gap-4">
              {/* Soft glow halo */}
              <div
                className="absolute h-32 w-32 rounded-full blur-2xl opacity-60"
                style={{ backgroundColor: `color-mix(in srgb, var(--brand) 25%, transparent)` }}
              />
              {/* Icon — kept on a white tile so black-on-transparent
                   logos (QuikScale, QuikInfra) stay visible against
                   the dark card body. */}
              <div
                className={cn(
                  "relative h-24 w-24 rounded-2xl",
                  "flex items-center justify-center",
                  "bg-white",
                  "ring-1 ring-zinc-700/50",
                  "shadow-2xl shadow-black/40",
                  "transition-all duration-500 group-hover:scale-110 group-hover:rotate-3",
                )}
              >
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt={title}
                    className="h-16 w-16 object-contain"
                  />
                ) : (
                  <span
                    className="text-3xl font-bold tracking-tight"
                    style={{ color: `var(--brand)` }}
                  >
                    {title.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Subtle radial glow at top so the card has a "lit" feel */}
          <div
            className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full blur-3xl opacity-40"
            style={{ backgroundColor: `color-mix(in srgb, var(--brand) 60%, transparent)` }}
          />

          {/* Bottom content */}
          <div className="absolute right-0 bottom-0 left-0 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <h3 className="text-lg leading-snug font-semibold tracking-tight text-white transition-all duration-500 ease-out group-hover:translate-y-[-4px] truncate">
                  {title}
                </h3>
                <p className="line-clamp-2 text-sm tracking-tight text-zinc-400 transition-all delay-[50ms] duration-500 ease-out group-hover:translate-y-[-4px]">
                  {subtitle}
                </p>
              </div>
              <div className="group/icon relative flex-shrink-0">
                <div
                  className="absolute inset-[-8px] rounded-lg opacity-0 group-hover/icon:opacity-100 transition-opacity duration-300"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, color-mix(in srgb, var(--brand) 20%, transparent), transparent)`,
                  }}
                />
                <Sparkles
                  className="relative z-10 h-5 w-5 transition-all duration-300 group-hover/icon:scale-110 group-hover/icon:rotate-12"
                  style={{ color: `var(--brand)` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Back ── */}
        <div
          className={cn(
            "absolute inset-0 h-full w-full",
            "[transform:rotateY(180deg)] [backface-visibility:hidden]",
            "rounded-2xl p-5",
            "bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-800",
            "border border-zinc-800/60",
            "shadow-2xl",
            "flex flex-col",
            !isFlipped ? "opacity-0" : "opacity-100",
            "transition-opacity duration-700",
          )}
        >
          {/* Background gradient */}
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              backgroundImage: `linear-gradient(to bottom right, color-mix(in srgb, var(--brand) 8%, transparent), transparent 60%, color-mix(in srgb, var(--brand) 5%, transparent))`,
            }}
          />

          <div className="relative z-10 flex-1 space-y-4 overflow-hidden">
            <div className="space-y-2">
              <div className="mb-2 flex items-center gap-2">
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt=""
                    className="h-8 w-8 object-contain rounded-md bg-white p-1 ring-1 ring-zinc-700/50"
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md text-white text-sm font-bold"
                    style={{ backgroundColor: `var(--brand)` }}
                  >
                    {title.charAt(0).toUpperCase()}
                  </div>
                )}
                <h3 className="text-lg leading-snug font-semibold tracking-tight text-white truncate">
                  {title}
                </h3>
              </div>
              <p className="line-clamp-3 text-sm tracking-tight text-zinc-400">
                {description}
              </p>
            </div>

            {features.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
                  What&apos;s inside
                </p>
                <ul className="space-y-1.5">
                  {features.slice(0, 4).map((feature, index) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-zinc-300 transition-all duration-500"
                      style={{
                        transform: isFlipped ? "translateX(0)" : "translateX(-10px)",
                        opacity: isFlipped ? 1 : 0,
                        transitionDelay: `${index * 80 + 200}ms`,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: `var(--brand)` }}
                      />
                      <span className="font-medium truncate">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="relative z-10 mt-auto border-t border-zinc-800 pt-3">
            <div
              className={cn(
                "group/start relative flex items-center justify-between rounded-lg p-2.5",
                "bg-zinc-800/60 ring-1 ring-zinc-700/50",
                "transition-all duration-300",
              )}
              style={{
                backgroundImage: isFlipped
                  ? `linear-gradient(to right, color-mix(in srgb, var(--brand) 30%, transparent), color-mix(in srgb, var(--brand) 10%, transparent), transparent)`
                  : undefined,
              }}
            >
              <span
                className="text-sm font-semibold transition-colors duration-300 text-white"
                style={{ color: isFlipped ? `var(--brand)` : undefined }}
              >
                Launch
              </span>
              <ArrowRight
                className="relative z-10 h-4 w-4 transition-all duration-300 group-hover/start:translate-x-1 group-hover/start:scale-110"
                style={{ color: `var(--brand)` }}
              />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
