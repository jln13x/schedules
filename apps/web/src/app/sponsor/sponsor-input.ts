import { z } from "zod";

export const SPONSOR_INPUT = z.object({
  name: z.string().trim().min(1, "Enter your product name.").max(40),
  description: z.string().trim().min(1, "Enter a description.").max(100),
  url: z
    .string()
    .trim()
    .max(500)
    .pipe(z.url({ protocol: /^https?$/ })),
});

export type SponsorInput = z.infer<typeof SPONSOR_INPUT>;
