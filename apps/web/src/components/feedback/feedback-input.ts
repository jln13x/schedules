import { z } from "zod";
import { IDENTITY_LIMITS } from "@/db/format";

export const REPORT_REASONS = {
  dangerous: "Dangerous or malicious prompt",
  misleading: "Spam or misleading",
  broken: "Broken or does not work",
  takedown: "Copyright or removal request",
  other: "Something else",
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

const PAGE = z
  .string()
  .trim()
  .max(2 * IDENTITY_LIMITS.repositorySegment + IDENTITY_LIMITS.scheduleSlug + 3)
  .regex(/^\/[\w\-./]*$/, "Invalid page")
  .default("/");

export const FEEDBACK_INPUT = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("report"),
    page: PAGE,
    reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]], {
      error: "Choose a reason.",
    }),
    details: z.string().trim().max(1000, "Keep details under 1000 characters.").default(""),
  }),
  z.object({
    kind: z.literal("feedback"),
    page: PAGE,
    details: z
      .string()
      .trim()
      .min(5, "Tell us a little more.")
      .max(2000, "Keep feedback under 2000 characters."),
  }),
]);

export type FeedbackInput = z.infer<typeof FEEDBACK_INPUT>;
