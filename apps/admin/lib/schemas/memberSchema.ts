import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  role: z.enum(["super_admin", "admin", "executive", "manager", "coach", "employee"]),
});

export const updateMemberSchema = z.object({
  role: z
    .enum(["super_admin", "admin", "executive", "manager", "coach", "employee"])
    .optional(),
  status: z.enum(["active", "inactive"]).optional(),
  teamIds: z.array(z.string()).optional(),
  customPermissions: z.record(z.unknown()).optional(),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
