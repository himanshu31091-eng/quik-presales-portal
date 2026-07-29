import { cn, generateInitials } from "../lib/utils";

interface AvatarProps {
  src?: string | null;
  firstName?: string;
  lastName?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export function Avatar({ src, firstName = "", lastName = "", size = "md", className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={`${firstName} ${lastName}`}
        className={cn("rounded-full object-cover", sizeClasses[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-[var(--color-secondary-light)] text-[var(--color-secondary-dark)] font-medium",
        sizeClasses[size],
        className
      )}
    >
      {generateInitials(firstName, lastName)}
    </div>
  );
}
