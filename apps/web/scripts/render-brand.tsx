/**
 * Renders the dithered wordmark and mark to public/brand/*.svg. Run after changing the art:
 *
 *   bun scripts/render-brand.tsx
 */
import { writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DitherPattern } from "@/lib/dither";

// Generated with figlet (ANSI Regular); regenerate rather than hand-edit.
const WORDMARK = `███████  ██████ ██   ██ ███████ ██████  ██    ██ ██      ███████ ███████
██      ██      ██   ██ ██      ██   ██ ██    ██ ██      ██      ██
▓▓▓▓▓▓▓ ▓▓      ▓▓▓▓▓▓▓ ▓▓▓▓▓   ▓▓   ▓▓ ▓▓    ▓▓ ▓▓      ▓▓▓▓▓   ▓▓▓▓▓▓▓
     ▒▒ ▒▒      ▒▒   ▒▒ ▒▒      ▒▒   ▒▒ ▒▒    ▒▒ ▒▒      ▒▒           ▒▒
░░░░░░░  ░░░░░░ ░░   ░░ ░░░░░░░ ░░░░░░   ░░░░░░  ░░░░░░░ ░░░░░░░ ░░░░░░░`;

const MARK = WORDMARK.split("\n")
  .map((row) => row.slice(0, 7))
  .join("\n");

// --primary in globals.css. An <img> can't read CSS variables, and the site is dark only.
const INK = "#ededed";
const GLYPH_WIDTH = 6;
const GLYPH_HEIGHT = 12;
const SHADES: Record<string, number> = { "▓": 0.75, "▒": 0.5, "░": 0.25 };

/** One rect per run of the same glyph in a row, in glyph units. */
function glyphRuns(art: string) {
  const rows = art.split("\n").map((row) => Array.from(row));
  const runs: Array<{ glyph: string; x: number; y: number; length: number }> = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const glyph = row[x];
      let end = x;
      while (row[end] === glyph) {
        end += 1;
      }
      if (glyph && glyph !== " ") {
        runs.push({ glyph, x, y, length: end - x });
      }
      x = end;
    }
  });
  return {
    columns: Math.max(...rows.map((row) => row.length)),
    rows: rows.length,
    runs,
  };
}

/** `cell` is the dither cell in glyph units; raise it when the art is drawn small so dots stay whole pixels. */
function GlyphArt({ art, cell }: { art: string; cell: number }) {
  const { columns, rows, runs } = glyphRuns(art);
  const width = columns * GLYPH_WIDTH;
  const height = rows * GLYPH_HEIGHT;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
    >
      <defs>
        {Object.entries(SHADES).map(([glyph, level]) => (
          <DitherPattern key={glyph} id={`shade-${level}`} level={level} cell={cell} />
        ))}
      </defs>
      {runs.map(({ glyph, x, y, length }) => {
        const level = SHADES[glyph];
        return (
          <rect
            key={`${x}-${y}`}
            x={x * GLYPH_WIDTH}
            y={y * GLYPH_HEIGHT}
            width={length * GLYPH_WIDTH}
            height={GLYPH_HEIGHT}
            fill={level === undefined ? INK : `url(#shade-${level})`}
          />
        );
      })}
    </svg>
  );
}

for (const [name, art, cell] of [
  ["wordmark", WORDMARK, 2],
  ["mark", MARK, 4],
] as const) {
  const svg = renderToStaticMarkup(<GlyphArt art={art} cell={cell} />).replaceAll(
    /var\(--dither-ink[^)]*\)/g,
    INK,
  );
  writeFileSync(new URL(`../public/brand/${name}.svg`, import.meta.url), `${svg}\n`);
  console.log(
    `${name}.svg ${svg
      .match(/width="(\d+)" height="(\d+)"/)
      ?.slice(1)
      .join("x")}`,
  );
}
