import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The favicon as a PNG, for home screens and bookmarks that don't take SVG. */
export default async function AppleIcon() {
  const svg = await readFile(join(process.cwd(), "src/app/icon.svg"), "utf8");
  return new ImageResponse(
    // Square and black to the edges: iOS rounds the corners itself.
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#000" }}>
      <img
        src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
        width={size.width}
        height={size.height}
        alt=""
      />
    </div>,
    size,
  );
}
