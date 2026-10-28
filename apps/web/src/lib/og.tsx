import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const LINE = "rgba(255, 255, 255, 0.14)";
const MARK = "rgba(255, 255, 255, 0.45)";
const MUTED = "rgba(255, 255, 255, 0.55)";
const INSET = 64;
const HOUR_WIDTH = (OG_SIZE.width - 2 * INSET) / 24;
const CROSS = 13;
const FONTS = [
  { name: "Geist", family: "Geist", weight: 400 },
  { name: "Geist", family: "Geist", weight: 600 },
  { name: "Geist Mono", family: "Geist+Mono", weight: 400 },
] as const;

// Satori's layout time grows with text length, and the image can't show more than this anyway.
const clip = (text: string, limit: number) =>
  text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

export async function ogImage({
  title: fullTitle,
  subtitle: fullSubtitle,
  command: fullCommand,
  prompt = false,
  hour,
}: {
  title: string;
  subtitle?: string;
  command?: string;
  prompt?: boolean;
  hour?: number;
}) {
  const title = clip(fullTitle, 160);
  const subtitle = fullSubtitle === undefined ? undefined : clip(fullSubtitle, 200);
  const command = fullCommand === undefined ? undefined : clip(fullCommand, 120);
  const titleSize = prompt ? 40 : title.length > 28 ? 64 : 80;
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at 50% 45%, #111111 0%, #0a0a0a 70%)",
        color: "#ffffff",
        fontFamily: "Geist",
      }}
    >
      <Frame hour={hour} />
      <div
        style={{
          position: "absolute",
          left: INSET + 36,
          bottom: INSET + 32,
          display: "flex",
          fontSize: 26,
          fontWeight: 600,
        }}
      >
        schedules<span style={{ color: MUTED, fontWeight: 400 }}>.sh</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: 1000,
          textAlign: "center",
        }}
      >
        {prompt ? (
          <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: titleSize }}>
            <span style={{ color: MUTED, marginRight: 24 }}>&gt;</span>
            {`"${title}"`}
          </div>
        ) : (
          <div
            style={{
              fontSize: titleSize,
              lineHeight: 1.08,
              fontWeight: 600,
              letterSpacing: -2,
              display: "block",
              lineClamp: 2,
            }}
          >
            {title}
          </div>
        )}
        {subtitle && (
          <div style={{ marginTop: 28, fontSize: 28, lineHeight: 1.4, color: MUTED }}>
            {subtitle}
          </div>
        )}
        {command && (
          <div
            style={{
              display: "flex",
              marginTop: 40,
              maxWidth: 1000,
              padding: "14px 22px",
              border: `1px solid ${LINE}`,
              borderRadius: 10,
              background: "rgba(255, 255, 255, 0.05)",
              fontFamily: "Geist Mono",
              fontSize: 21,
            }}
          >
            <span style={{ color: MUTED, marginRight: 14 }}>$</span>
            <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {command}
            </span>
          </div>
        )}
      </div>
    </div>,
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}

const fade = (direction: string) =>
  `linear-gradient(${direction}, transparent, ${LINE} 18%, ${LINE} 82%, transparent)`;

function Frame({ hour }: { hour: number | undefined }) {
  const corners = [
    { left: INSET, top: INSET },
    { right: INSET, top: INSET },
    { left: INSET, bottom: INSET },
    { right: INSET, bottom: INSET },
  ];
  return (
    // One absolute layer: Satori would lay a bare fragment out as a flex item.
    <div style={{ position: "absolute", top: 0, left: 0, ...OG_SIZE, display: "flex" }}>
      {[{ top: INSET }, { bottom: INSET }].map((edge) => (
        <div
          key={Object.keys(edge)[0]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 1,
            background: fade("to right"),
            ...edge,
          }}
        />
      ))}
      {[{ left: INSET }, { right: INSET }].map((edge) => (
        <div
          key={Object.keys(edge)[0]}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 1,
            background: fade("to bottom"),
            ...edge,
          }}
        />
      ))}
      {Array.from({ length: 23 }, (_, index) => {
        const tick = index + 1;
        const major = tick % 6 === 0;
        const style = {
          position: "absolute",
          left: INSET + tick * HOUR_WIDTH,
          width: 1,
          height: major ? 10 : 5,
          background: major ? MARK : LINE,
        } as const;
        return [
          <div
            key={`top-${tick}`}
            style={{
              ...style,
              top: INSET,
              ...(tick === hour && { height: 18, background: "#ffffff" }),
            }}
          />,
          <div key={`bottom-${tick}`} style={{ ...style, bottom: INSET }} />,
        ];
      })}
      {corners.flatMap((corner, index) =>
        [
          { width: CROSS, height: 1, x: (CROSS - 1) / 2, y: 0 },
          { width: 1, height: CROSS, x: 0, y: (CROSS - 1) / 2 },
        ].map(({ width, height, x, y }) => (
          <div
            key={`${index}-${width}`}
            style={{
              position: "absolute",
              width,
              height,
              background: MARK,
              ...("left" in corner ? { left: corner.left - x } : { right: corner.right - x }),
              ...("top" in corner ? { top: corner.top - y } : { bottom: corner.bottom - y }),
            }}
          />
        )),
      )}
    </div>
  );
}

let LOADED_FONTS: ReturnType<typeof fetchFonts> | undefined;

function loadFonts() {
  LOADED_FONTS ??= fetchFonts().catch((error: unknown) => {
    LOADED_FONTS = undefined;
    throw error;
  });
  return LOADED_FONTS;
}

// Without a browser user agent Google Fonts serves TrueType, which Satori reads; browsers get WOFF2.
function fetchFonts() {
  return Promise.all(
    FONTS.map(async ({ name, family, weight }) => {
      const css = await fetch(
        `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`,
      ).then((response) => response.text());
      const url = /src:\s*url\(([^)]+)\)/.exec(css)?.[1];

      if (!url) {
        throw new Error(`Google Fonts served no ${name} ${weight}`);
      }

      return {
        name,
        weight,
        style: "normal" as const,
        data: await fetch(url).then((response) => response.arrayBuffer()),
      };
    }),
  );
}
