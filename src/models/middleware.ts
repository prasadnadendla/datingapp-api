import { email, z } from "zod/v4";

const phoneRegex = /^\+91\d{10}$/;

export const SignIn = z.object({
  phone: z.string().regex(phoneRegex, { message: "Invalid phone number format" }),
});

export const SignInVerify = z.object({
  phone: z.string().regex(phoneRegex, { message: "Invalid phone number format" }),
  code: z.string().trim().length(6, { message: "Code must be 6 characters long" })
});



export type SignInInput = z.infer<typeof SignIn>
export type SignInVerifyInput = z.infer<typeof SignInVerify>


// Acceptable MIME types
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp','image/jpg','image/bmp','image/x-ms-bmp'];

export const uploadImageSchema = z.object({
  image: z
    .any()
    .refine((image) => image instanceof File || (image && image.buffer), {
      message: 'File is required and must be a valid image file.',
    })
    .refine(
      (image) => ACCEPTED_IMAGE_TYPES.includes(image.type),
      { message: 'Invalid file type. Only JPEG, PNG, and WEBP are allowed.' }
    )
    .refine((image) => image.size <= 5 * 1024 * 1024, {
      message: 'File size must be under 5MB.',
    }),

  // Optional metadata
  title: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  is360: z.string().max(5).optional()
});

export type UploadImageInput = z.infer<typeof uploadImageSchema>;

export const deleteImageSchema = z.object({
  url: z.url({ message: 'Invalid URL format.' }),
});
export type DeleteImageInput = z.infer<typeof deleteImageSchema>;

export const OnboardSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[^\d]+$/, { message: "Name must not contain numbers" }),
  purpose: z.array(z.enum(['casual', 'serious', 'marriage'])).min(1),
  details: z.object({
    age: z.number().int().min(18).max(60),
    gender: z.enum(['male', 'female', 'other']),
    city: z.string().min(2).max(100),
    photos: z.array(z.string().url()).min(1).max(6),
    tags: z.array(z.string()).max(5).default([]),
    motherTongue: z.string().max(50).optional().default(''),
  }),
});
export type OnboardInput = z.infer<typeof OnboardSchema>;

export const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[^\d]+$/, { message: "Name must not contain numbers" }).optional(),
  age: z.number().int().min(18).max(60).optional(),
  city: z.string().min(2).max(100).optional(),
  intent: z.enum(['casual', 'serious', 'marriage']).optional(),
  photos: z.array(z.string().url()).max(6).optional(),
  tags: z.array(z.string()).max(5).optional(),
  motherTongue: z.string().max(50).optional(),
  education: z.string().max(100).optional(),
  profession: z.string().max(100).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const Graph = z.object({
    operationName: z.string().max(255).describe("operation name").optional(),
    query: z.string().trim().max(5000).describe("Graph query"),  
    variables: z.record(z.string(), z.any()).optional().describe("Graph variables"),
});

export type GraphInput = z.infer<typeof Graph>;