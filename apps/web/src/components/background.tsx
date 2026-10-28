import { DitherShader } from "@/lib/dither";

// A grid of day squares like a contribution graph: most stay faint, a few clusters light up.
const CALENDAR = `
float field(vec2 uv, vec2 res, float t) {
  vec2 grid = uv * res / 8.0;
  vec2 id = floor(grid);
  vec2 f = fract(grid);
  float inside = step(0.125, f.x) * step(f.x, 0.875) * step(0.125, f.y) * step(f.y, 0.875);
  float heat = pow(hash21(id), 3.0);
  float region = smoothstep(0.35, 0.7, fbm(id * 0.08));
  return inside * (0.05 + 0.55 * heat * region);
}`;

export function Background() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 opacity-[0.0875]">
      <DitherShader field={CALENDAR} animate={false} className="size-full" />
    </div>
  );
}
