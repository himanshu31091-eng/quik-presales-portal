import { z } from "zod";

export const updateSettingsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color")
    .optional(),
  billingEmail: z.string().email("Invalid email").optional(),
  fiscalYearStart: z.number().int().min(1).max(12).optional(),
  weekStartDay: z.number().int().min(0).max(6).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
