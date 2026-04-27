import { cn } from "@/lib/core/utils";

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-muted", className)}
    />
  );
}

export { Skeleton };
