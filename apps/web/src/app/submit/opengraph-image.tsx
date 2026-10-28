import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Submit a schedule to schedules.sh";

export default function OpenGraphImage() {
  return ogImage({
    title: "Submit a schedule",
    subtitle: "List the schedules in a public GitHub repository.",
  });
}
