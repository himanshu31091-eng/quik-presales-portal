import { z } from "zod";

export const createRoleSchema = z.object({
  name:        z.string().min(1, "Role name is required").max(50, "Name must be 50 characters or less"),
  description: z.string().max(200, "Description must be 200 characters or less").optional(),
  appSlug:     z.string().min(1, "App is required"),
  permissions: z.array(z.string().min(1)).min(1, "Select at least one permission"),
});

export const updateRoleSchema = z.object({
  name:        z.string().min(1).max(50).optional(),
  description: z.string().max(200).nullable().optional(),
  permissions: z.array(z.string().min(1)).min(1, "Select at least one permission").optional(),
});
