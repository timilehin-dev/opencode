"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/core/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant: "danger" | "default";
  onConfirm: () => void;
}

interface ConfirmContextValue {
  confirm: (options: {
    title?: string;
    message: string;
    confirmLabel?: string;
    variant?: "danger" | "default";
  }) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

import { createContext, useContext } from "react";

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    title: "Confirm",
    message: "",
    confirmLabel: "Confirm",
    variant: "default",
    onConfirm: () => {},
  });

  const confirm = useCallback(
    (options: {
      title?: string;
      message: string;
      confirmLabel?: string;
      variant?: "danger" | "default";
    }): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          open: true,
          title: options.title ?? "Confirm",
          message: options.message,
          confirmLabel: options.confirmLabel ?? "Confirm",
          variant: options.variant ?? "default",
          onConfirm: () => {
            setState((s) => ({ ...s, open: false }));
            resolve(true);
          },
        });
      });
    },
    []
  );

  const handleCancel = () => {
    setState((s) => ({ ...s, open: false }));
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {/* Dialog overlay */}
      {state.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleCancel}
          />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-[360px] w-full p-5 animate-in fade-in-0 zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-foreground">{state.title}</h3>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              {state.message}
            </p>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={handleCancel}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button
                onClick={state.onConfirm}
                className={cn(
                  "px-3.5 py-2 rounded-lg text-xs font-semibold transition-all",
                  state.variant === "danger"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-primary text-white hover:bg-primary/90"
                )}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside a <ConfirmProvider>");
  return ctx;
}
