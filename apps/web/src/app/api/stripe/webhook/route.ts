import { revalidateTag } from "next/cache";
import { SPONSORS_TAG } from "@/server/cached";
import { run } from "@/server/runtime";
import { sponsorWebhook } from "./sponsor-webhook";

export async function POST(request: Request) {
  const response = await run(sponsorWebhook(request));
  revalidateTag(SPONSORS_TAG, "max");
  return response;
}
