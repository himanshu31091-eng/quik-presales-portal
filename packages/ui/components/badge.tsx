import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-neutral-100)] text-[var(--color-text-secondary)]",
        active: "bg-[var(--color-success-light)] text-[var(--color-success-dark)]",
        invited: "bg-[var(--color-warning-light)] text-[var(--color-warning-dark)]",
        inactive: "bg-[var(--color-neutral-200)] text-[var(--color-neutral-500)]",
        declined: "bg-[var(--color-danger-light)] text-[var(--color-danger-dark)]",
        admin: "bg-[var(--color-secondary-light)] text-[var(--color-secondary-dark)]",
        super_admin: "bg-[var(--color-secondary-light)] text-[var(--color-secondary-dark)]",
        manager: "bg-blue-50 text-blue-700",
        employee: "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)]",
        executive: "bg-purple-50 text-purple-700",
        coach: "bg-teal-50 text-teal-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ variant, className, children, ...props }: BadgeProps & { children: React.ReactNode }) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {children}
    </span>
  );
}

export { badgeVariants };
