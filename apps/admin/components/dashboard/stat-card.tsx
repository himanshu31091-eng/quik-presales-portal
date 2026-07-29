import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  trend?: { value: number; label: string };
}

export default function StatCard({
  label,
  value,
  icon,
  iconBg = "bg-[var(--color-secondary-light)]",
  iconColor = "text-[var(--color-secondary)]",
  trend,
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 flex items-center gap-4">
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", iconBg)}>
        <span className={cn("h-5 w-5", iconColor)}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--color-text-primary)]">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        <p className="text-sm text-[var(--color-text-secondary)]">{label}</p>
        {trend && (
          <p className={cn("text-xs mt-0.5", trend.value >= 0 ? "text-green-600" : "text-red-500")}>
            {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </div>
    </div>
  );
}
