import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  return format(dateObj, "MMM d, yyyy");
}

export function formatDateTime(date: Date | string): string {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  return format(dateObj, "MMM d, yyyy h:mm a");
}

export function formatRelativeDate(date: Date | string): string {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return formatDate(dateObj);
}

export function calculateProgress(achieved: number, goal: number): number {
  if (!goal || goal === 0) return 0;
  return Math.min(Math.round((achieved / goal) * 100), 100);
}

export function generateInitials(firstName: string, lastName: string): string {
  return `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function truncateText(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.substring(0, length) + "...";
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function getQuarterFromMonth(month: number): "Q1" | "Q2" | "Q3" | "Q4" {
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

export function getMonthsForQuarter(quarter: string): number[] {
  switch (quarter) {
    case "Q1":
      return [1, 2, 3];
    case "Q2":
      return [4, 5, 6];
    case "Q3":
      return [7, 8, 9];
    case "Q4":
      return [10, 11, 12];
    default:
      return [];
  }
}

export function getCurrentQuarter(): "Q1" | "Q2" | "Q3" | "Q4" {
  return getQuarterFromMonth(new Date().getMonth() + 1);
}

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

export function getCurrentWeek(): number {
  const firstDayOfYear = new Date(new Date().getFullYear(), 0, 1);
  const pastDaysOfYear =
    (new Date().getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if object has own property
 */
export function hasOwnProperty<T extends object>(
  obj: T,
  prop: PropertyKey
): prop is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

/**
 * Retry a promise-returning function
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw new Error("Retry failed");
}
