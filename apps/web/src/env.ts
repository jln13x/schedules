import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.NODE_ENV === "test",
  server: {
    DATABASE_URL: z.url(),
    GITHUB_TOKEN: z.string().min(1),
    CRON_SECRET: z.string().min(1),
    KV_REST_API_URL: z.url(),
    KV_REST_API_TOKEN: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
    STRIPE_SPONSOR_PRICE_ID: z.string().startsWith("price_"),
    STRIPE_CUSTOMER_PORTAL_URL: z.url(),
    /** Reports and feedback are posted here. Both forms report an error without it. */
    DISCORD_WEBHOOK_URL: z.url().optional(),
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  },
});
