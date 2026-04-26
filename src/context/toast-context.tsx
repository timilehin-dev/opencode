"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "info", duration = 4000) => {
      const id = `toast-${++toastCounter}`;
      const toast: Toast = { id, message, variant, duration };
      setToasts((prev) => [...prev.slice(-4), toast]); // cap at 5 visible

      if (duration > 0) {
        const timer = setTimeout(() => removeToast(id), duration);
        timersRef.current.set(id, timer);
      }
    },
    [removeToast]
  );

  const toast = useCallback(
    (message: string, variant?: ToastVariant, duration?: number) =>
      addToast(message, variant ?? "info", duration),
    [addToast]
  );
  const success = useCallback((msg: string) => addToast(msg, "success"), [addToast]);
  const error = useCallback((msg: string) => addToast(msg, "error", 6000), [addToast]);
  const info = useCallback((msg: string) => addToast(msg, "info"), [addToast]);
  const warning = useCallback((msg: string) => addToast(msg, "warning"), [addToast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[360px] pointer-events-none lg:bottom-6 lg:right-6">
        {/* Mobile: full width at bottom, above bottom nav */}
        <div className="lg:hidden fixed bottom-[68px] left-3 right-3 z-[100] flex flex-col gap-2 pointer-events-none max-w-none" />
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx)
    throw new Error("useToast must be used inside a <ToastProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Toast Item
// ---------------------------------------------------------------------------

const VARIANT_CONFIG: Record<
  ToastVariant,
  { icon: ReactNode; bg: string; border: string; text: string; iconColor: string }
> = {
  success: {
    icon: <CheckCircle className="w-4 h-4" />,
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800/50",
    text: "text-emerald-900 dark:text-emerald-100",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    icon: <AlertCircle className="w-4 h-4" />,
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-800/50",
    text: "text-red-900 dark:text-red-100",
    iconColor: "text-red-600 dark:text-red-400",
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800/50",
    text: "text-amber-900 dark:text-amber-100",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  info: {
    icon: <Info className="w-4 h-4" />,
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-800/50",
    text: "text-blue-900 dark:text-blue-100",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const config = VARIANT_CONFIG[toast.variant];

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in-0 duration-200",
        config.bg,
        config.border
      )}
    >
      <span className={cn("mt-0.5 flex-shrink-0", config.iconColor)}>
        {config.icon}
      </span>
      <p className={cn("text-sm font-medium flex-1 leading-snug", config.text)}>
        {toast.message}
      </p>
      <button
        onClick={onDismiss}
        className={cn(
          "flex-shrink-0 p-0.5 rounded-md opacity-60 hover:opacity-100 transition-opacity",
          config.iconColor
        )}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
