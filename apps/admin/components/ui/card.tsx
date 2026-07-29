import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export default function Card({ children, className, title }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5",
        className
      )}
    >
      {title && (
        <h2 className="mb-4 text-base font-semibold text-[var(--color-text-primary)]">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
