"use client";

import { Fragment, useMemo } from "react";
import type { AppModuleConfig, ModuleDef } from "@quikit/shared/moduleRegistry";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";
import { ToggleSwitch } from "./toggle-switch";
import { cn } from "../lib/utils";

export interface ModuleTreeProps {
  /** Registry entry for one app, usually from MODULE_REGISTRY. */
  app: AppModuleConfig;
  /** The set of moduleKeys that are currently disabled for the target tenant. */
  disabledKeys: Set<string>;
  /**
   * Called when the user clicks a toggle.
   *   - `nextEnabled = true`  → caller should remove/absent the row (re-enable)
   *   - `nextEnabled = false` → caller should upsert a row with enabled: false
   */
  onToggle: (moduleKey: string, nextEnabled: boolean) => void;
  /** Rows that are mid-save (optimistic UI). Prevents double-clicks. */
  pendingKeys?: Set<string>;
  /** Whole tree is disabled (e.g., no tenant selected yet). */
  disabled?: boolean;
}

/**
 * Renders an app's module tree with a toggle beside every row.
 *
 * Hierarchy comes from the `parentKey` field (and the dot-notation in
 * `key`, which they mirror). A top-level row with `parentKey: undefined`
 * renders as a section header. Its children render below, indented.
 *
 * Cascade behavior is explained inline: when a parent is disabled, every
 * child row renders with a muted `"Disabled by parent"` badge even if its
 * own toggle is in the "on" position, because the cascade rule in
 * `isModuleEnabled` will hide it regardless.
 */
export function ModuleTree({
  app,
  disabledKeys,
  onToggle,
  pendingKeys,
  disabled = false,
}: ModuleTreeProps) {
  /** Group modules into {parent, children[]} tuples, preserving registry order. */
  const groups = useMemo(() => groupByParent(app.modules), [app.modules]);

  return (
    <div className="space-y-3">
      {groups.map((g, idx) => {
        const parentExplicitlyDisabled = disabledKeys.has(g.parent.key);
        // Render a section header whenever the top-level module's `section`
        // changes from the previous group (mirrors the app sidebar's pillars).
        const prevSection = idx > 0 ? groups[idx - 1].parent.section : undefined;
        const showSection = !!g.parent.section && g.parent.section !== prevSection;
        return (
          <Fragment key={g.parent.key}>
            {showSection && (
              <div className="px-1 pt-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                {g.parent.section}
              </div>
            )}
          <section
            className="rounded-lg border border-gray-200 bg-white overflow-hidden"
          >
            <ModuleRow
              module={g.parent}
              enabled={!disabledKeys.has(g.parent.key)}
              effectiveEnabled={isModuleEnabled(g.parent.key, disabledKeys)}
              onToggle={onToggle}
              pending={pendingKeys?.has(g.parent.key) ?? false}
              disabled={disabled}
              isParent
            />
            {g.children.length > 0 && (
              <div
                className={cn(
                  "border-t border-gray-100 bg-gray-50/40",
                  parentExplicitlyDisabled && "opacity-80",
                )}
              >
                {g.children.map((child) => (
                  <ModuleRow
                    key={child.key}
                    module={child}
                    enabled={!disabledKeys.has(child.key)}
                    effectiveEnabled={isModuleEnabled(child.key, disabledKeys)}
                    onToggle={onToggle}
                    pending={pendingKeys?.has(child.key) ?? false}
                    disabled={disabled || parentExplicitlyDisabled}
                    indented
                  />
                ))}
              </div>
            )}
          </section>
          </Fragment>
        );
      })}
    </div>
  );
}

/* ─── Single row ───────────────────────────────────────────────────────── */

interface ModuleRowProps {
  module: ModuleDef;
  enabled: boolean;                // state of THIS row's own flag (ignoring cascade)
  effectiveEnabled: boolean;        // result of cascade rule (for the badge)
  onToggle: (moduleKey: string, nextEnabled: boolean) => void;
  pending: boolean;
  disabled: boolean;
  isParent?: boolean;
  indented?: boolean;
}

function ModuleRow({
  module: m,
  enabled,
  effectiveEnabled,
  onToggle,
  pending,
  disabled,
  isParent,
  indented,
}: ModuleRowProps) {
  const hiddenByParent = enabled && !effectiveEnabled; // toggle is on, but parent is off
  // Off by default for new orgs, but still toggleable per tenant. Show the hint
  // only while it's at its default (off) — once enabled the toggle says enough.
  const defaultOffHint = m.defaultDisabled === true && !enabled;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5",
        indented && "pl-10",
      )}
    >
      <div className="min-w-0">
        <div
          className={cn(
            "text-sm",
            isParent ? "font-semibold text-gray-900" : "font-medium text-gray-700",
          )}
        >
          {m.label}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <code className="font-mono">{m.key}</code>
          {defaultOffHint ? (
            <span className="text-gray-400">· Off by default — enable per org</span>
          ) : hiddenByParent && (
            <span className="text-amber-600">· Hidden: parent disabled</span>
          )}
        </div>
      </div>
      <ToggleSwitch
        checked={enabled}
        onChange={(next) => onToggle(m.key, next)}
        disabled={disabled}
        loading={pending}
        ariaLabel={`Toggle ${m.label}`}
        size={isParent ? "md" : "sm"}
      />
    </div>
  );
}

/* ─── Group by parent ──────────────────────────────────────────────────── */

interface ModuleGroup {
  parent: ModuleDef;
  children: ModuleDef[];
}

function groupByParent(modules: readonly ModuleDef[]): ModuleGroup[] {
  // preserve registry order; a module is a "parent" iff it has no parentKey
  const groups: ModuleGroup[] = [];
  const byParent = new Map<string, ModuleDef[]>();
  for (const m of modules) {
    if (!m.parentKey) groups.push({ parent: m, children: [] });
    else {
      const arr = byParent.get(m.parentKey) ?? [];
      arr.push(m);
      byParent.set(m.parentKey, arr);
    }
  }
  // attach children to their groups
  for (const g of groups) {
    g.children = byParent.get(g.parent.key) ?? [];
  }
  return groups;
}
