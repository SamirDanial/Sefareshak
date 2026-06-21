import { z } from "zod";

// Address validation schema
const addressSchema = z.object({
  id: z.string(),
  label: z.string().min(1, "Address label is required"),
  street: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(1, "ZIP code is required"),
  isDefault: z.boolean().default(false),
});

// User profile validation schema for frontend
export const profileSchema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .min(2, "First name must be at least 2 characters")
    .max(50, "First name must be less than 50 characters")
    .trim(),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .min(2, "Last name must be at least 2 characters")
    .max(50, "Last name must be less than 50 characters")
    .trim(),
  phone: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^[\+]?[\d\s\-\(\)]{7,20}$/, "Please enter a valid phone number")
    .transform((val) => val.replace(/\s/g, "")), // Remove spaces
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional()
    .default(""),
  addresses: z.array(addressSchema).default([]),
});

// Type export
export type ProfileFormData = z.infer<typeof profileSchema>;

// Validation helper function
export const validateProfileField = <K extends keyof ProfileFormData>(
  field: K,
  value: ProfileFormData[K]
): string | undefined => {
  const fieldSchema = (profileSchema.shape as Record<string, z.ZodTypeAny>)[field as string];
  const result = fieldSchema.safeParse(value);

  if (result.success) return undefined;

  return result.error.issues[0]?.message ?? "Invalid input";
};
