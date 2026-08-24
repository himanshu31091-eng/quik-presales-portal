"use client";

/**
 * ConfirmModal — promise-based replacement for window.confirm().
 *
 * Usage:
 *
 *   // Mount once near the app root (inside any client boundary):
 *   <ConfirmProvider>{children}</ConfirmProvider>
 *
 *   // Then anywhere below:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete team?", description: "...", tone: "danger" }))) return;
 *
 * Why promise-based: rewrites of every window.confirm() call site become a
 * one-line `await confirm({...})` — no need to rearchitect components to
 * hold pending-action state. The hook returns a Promise<boolean>.
 *
 * Tones:
 *   "default" — neutral confirm (e.g. "Update?")  [primary = accent blue]
 *   "danger"  — destructive action                 [primary = red]
 *   "warning" — cautious / reversible irreversible [primary = amber]
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

export type ConfirmTone = "default" | "danger" | "warning";

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Button label for the confirmation action. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Button label for the cancel action. Defaults to "Cancel". */
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const ConfirmContext = React.createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  // Portal target. We only render the dialog into document.body after mount so
  // server render (where `document` is undefined) stays a no-op and hydration
  // matches. Portaling to <body> is what makes the fixed backdrop escape the
  // sticky table's stacking contexts (thead z-30 / frozen th z-[35]) — rendered
  // inline, the backdrop gets trapped and the frozen header cells paint over it.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const confirm = React.useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // If a confirm is already open, auto-cancel it so we never stack dialogs.
      setPending((prev) => {
        if (prev) prev.resolve(false);
        return { ...opts, resolve };
      });
    });
  }, []);

  const close = React.useCallback((ok: boolean) => {
    setPending((current) => {
      if (current) current.resolve(ok);
      return null;
    });
  }, []);

  // Keyboard: Esc = cancel, Enter = confirm (only when dialog is open)
  React.useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  // Trap Tab inside the dialog and hand focus back to whatever opened it.
  // Escape/Enter above already cover the common exits, so this only closes the
  // remaining gap where a user Tabs out into the page behind the backdrop.
  const panelRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!pending) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [pending]);

  const toneClasses =
    pending?.tone === "danger"
      ? { icon: "text-red-600 bg-red-50", btn: "bg-red-600 hover:bg-red-700", Icon: AlertTriangle }
      : pending?.tone === "warning"
        ? { icon: "text-amber-700 bg-amber-50", btn: "bg-amber-600 hover:bg-amber-700", Icon: AlertCircle }
        : { icon: "text-blue-600 bg-blue-50", btn: "bg-accent-600 hover:bg-accent-700", Icon: Info };

  const Icon = toneClasses.Icon;

  const overlay = (
    <AnimatePresence>
      {pending && (
        <motion.div
          key="confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${toneClasses.icon}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 id={titleId} className="text-base font-semibold text-slate-900">{pending.title}</h3>
                    {pending.description && (
                      <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-wrap">{pending.description}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  {pending.cancelLabel ?? "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => close(true)}
                  autoFocus
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${toneClasses.btn}`}
                >
                  {pending.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {mounted ? createPortal(overlay, document.body) : null}
    </ConfirmContext.Provider>
  );
}

/**
 * Returns an async `confirm()` function that shows the dialog and resolves
 * to `true` on confirm or `false` on cancel / Esc / backdrop click.
 *
 * Throws if called outside a ConfirmProvider so we fail loudly rather than
 * silently returning false.
 */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm() must be called inside a <ConfirmProvider>. Mount it near your app root.");
  }
  return ctx;
}
