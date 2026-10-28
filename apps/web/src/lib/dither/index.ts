/**
 * dither-core: the shared engine behind every dithercn component.
 * Import from `@/lib/dither`.
 */

export { isInked } from "@/lib/dither/matrices";
export type { DitherMatrix } from "@/lib/dither/matrices";

export { cssColor, MOTION } from "@/lib/dither/tokens";
export type { DitherColor, Rgba } from "@/lib/dither/tokens";

export { bloomStyle, fillStyle, SERIES_COLORS } from "@/lib/dither/style";
export type { Bloom, FillVariant } from "@/lib/dither/style";

export { readDitherCell, useDitherColors } from "@/lib/dither/color";

export { useFrameLoop } from "@/lib/dither/motion";

export { DitherShader } from "@/lib/dither/shader";

export { BloomGroup, FillPattern } from "@/lib/dither/fill";

export { DitherPattern, ditherMaskStyle } from "@/lib/dither/pattern";
