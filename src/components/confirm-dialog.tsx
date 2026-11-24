"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Ask = (o: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/** `const confirm = useConfirm(); if (await confirm({...})) …` — Byte's own confirm box. */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  // Outside the provider (shouldn't happen) fall back to the browser's box.
  return ask ?? (async (o) => window.confirm(o.title));
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const ask = useCallback<Ask>((o) => {
    resolver.current?.(false);
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    ref.current?.close();
    setOpts(null);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (opts && d && !d.open) d.showModal();
  }, [opts]);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby="confirm-title"
        aria-describedby={opts?.body ? "confirm-body" : undefined}
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close(false); // click on the backdrop
        }}
        className="rise m-auto w-[min(420px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/45"
      >
        {opts && (
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-col gap-1.5">
              <h2 id="confirm-title" className="m-0 font-display text-xl font-extrabold leading-tight tracking-[-0.01em]">
                {opts.title}
              </h2>
              {opts.body && (
                <p id="confirm-body" className="m-0 text-[15px] leading-relaxed text-muted">
                  {opts.body}
                </p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => close(false)} className="btn min-h-11 rounded-[10px] border border-line px-4 font-medium text-fg">
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                className={`btn min-h-11 rounded-[10px] px-4 font-semibold ${opts.danger ? "bg-err text-bg" : "bg-inv text-inv-fg"}`}
              >
                {opts.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
