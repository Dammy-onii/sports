"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Icon, ICONS, cn } from "./ui";

/**
 * Overlays: a centred dialog (desktop) that becomes a bottom sheet on
 * phones, plus a lightweight toast queue.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 animate-fade sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[88dvh] w-full flex-col rounded-t-lg border border-line bg-surface shadow-xl outline-none animate-rise sm:rounded-lg",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${id}-t`} className="font-display text-2xl leading-tight">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
            <Icon d={ICONS.close} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

// ───────────── toasts ─────────────

type ToastTone = "info" | "good" | "bad";
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}
let toasts: ToastItem[] = [];
let nextToast = 1;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

export function toast(text: string, tone: ToastTone = "info") {
  const id = nextToast++;
  toasts = [...toasts, { id, text, tone }].slice(-4);
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitToasts();
  }, 3800);
}

const subscribeToasts = (l: () => void) => {
  toastListeners.add(l);
  return () => toastListeners.delete(l);
};
const noToasts: ToastItem[] = [];

export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, () => toasts, () => noToasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto max-w-md rounded-md px-4 py-2.5 text-sm shadow-lg animate-rise",
            t.tone === "good" ? "bg-win text-white" : t.tone === "bad" ? "bg-loss text-white" : "bg-accent text-accent-ink",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
