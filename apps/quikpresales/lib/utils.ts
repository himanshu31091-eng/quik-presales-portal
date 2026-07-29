import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn(...)` — combine Tailwind classes intelligently. Standard across all apps.
 * Use this any time you build a className from conditionals.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
