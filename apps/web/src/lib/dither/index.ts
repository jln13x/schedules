/**
 * dither-core: the shared engine behind every dithercn component.
 * Import from `@/lib/dither`.
 */

export { isInked } from "@/lib/dither/matrices";
export type { DitherMatrix } from "@/lib/dither/matrices";

export { cssColor } from "@/lib/dither/tokens";
export type { DitherColor, Rgba } from "@/lib/dither/tokens";

export { bloomStyle, fillStyle } from "@/lib/dither/style";
export type { Bloom, FillVariant } from "@/lib/dither/style";

export { useDitherColors } from "@/lib/dither/color";

export { useFrameLoop } from "@/lib/dither/motion";

export { DitherShader } from "@/lib/dither/shader";

export { FillPattern } from "@/lib/dither/fill";

export { DitherPattern } from "@/lib/dither/pattern";
