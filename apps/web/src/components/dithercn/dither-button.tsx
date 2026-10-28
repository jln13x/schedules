"use client";

import { Slot, Slottable } from "@radix-ui/react-slot";
import type { ComponentProps, CSSProperties, ReactNode } from "react";

import { bloomStyle, cssColor, fillStyle } from "@/lib/dither";
import type { Bloom, DitherColor, FillVariant } from "@/lib/dither";
import { cn } from "cn";
import { Loader } from "@/components/dithercn/loader";

/*
 * The surface is lit like a pixel-art bevel. A filled button is the full
 * colour, with a highlight (the colour mixed towards white) dithered down
 * from the top edge and a shade (towards black) dithered up from the
 * bottom, light at rest. The fill variant is the texture of the shade: a
 * ramp for gradient, a lattice for dotted, diagonals for hatched, and a thin
 * rim for solid. Hover fades in a taller, denser shade; press thins the
 * dither back out. Only opacity animates, so every cell stays on the grid.
 * Outline buttons draw the same layers in the plain colour at low
 * coverage, over a faint tint, inside a hairline edge.
 */

export type DitherButtonVariant = "filled" | "outline";
export type DitherButtonSize = "sm" | "md" | "lg" | "icon";

const HEIGHT = { icon: 36, lg: 44, md: 36, sm: 32 } as const satisfies Record<
  DitherButtonSize,
  number
>;

const SIZE = {
  icon: "size-9 rounded-md",
  lg: "h-11 gap-2 rounded-md px-5 text-[15px] [&_svg:not([class*='size-'])]:size-4.5",
  md: "h-9 gap-2 rounded-md px-4 text-sm",
  sm: "h-8 gap-1.5 rounded-md px-3 text-[13px]",
} as const satisfies Record<DitherButtonSize, string>;

interface Shades {
  base: string;
  light: string;
  dark: string;
}

const shadesOf = (color: DitherColor): Shades => {
  const base = cssColor(color);
  return {
    base,
    dark: `color-mix(in oklab, ${base}, black 48%)`,
    light: `color-mix(in oklab, ${base}, white 42%)`,
  };
};

interface LayerOptions {
  fill: FillVariant;
  cell: number;
  /** Height of the button in cells. */
  rows: number;
}

const cells = (rows: number, share: number) => Math.max(2, Math.round(rows * share));

/** The shade at rest, textured by the fill variant. */
const shadeLayer = ({ fill, cell, rows }: LayerOptions, color: string): CSSProperties => {
  switch (fill) {
    case "gradient": {
      return fillStyle("gradient", {
        cell,
        color,
        edge: "bottom",
        from: 1,
        length: cells(rows, 0.5),
        to: 0,
      });
    }
    case "dotted":
    case "hatched": {
      return { ...fillStyle(fill, { cell, color }), opacity: 0.5 };
    }
    case "solid": {
      return fillStyle("gradient", {
        cell,
        color,
        edge: "bottom",
        from: 1,
        length: 3,
        to: 0,
      });
    }
    default: {
      const exhaustive: never = fill;
      return exhaustive;
    }
  }
};

const highlight = ({ cell, rows }: LayerOptions, color: string, share: number, from: number) =>
  fillStyle("gradient", {
    cell,
    color,
    edge: "top",
    from,
    length: cells(rows, share),
    to: 0,
  });

/**
 * Keeps the label's band clear: dither shows only along the top and bottom
 * edges, so dots frame the text instead of crossing it.
 */
const CLEAR_LABEL = "linear-gradient(to bottom, #000 0 30%, transparent 34% 66%, #000 70%)";

// On a wrapper: the dither layers already use mask-image for their pattern,
// and an ancestor's mask composes with theirs.
const FRAME: CSSProperties = {
  WebkitMaskImage: CLEAR_LABEL,
  maskImage: CLEAR_LABEL,
};

/** A layer's inline style, with its opacity once shown (default 1). */
type LayerStyle = CSSProperties & { "--dcn-btn-on"?: string };

interface Surface {
  base: CSSProperties;
  rest: readonly CSSProperties[];
  hover: LayerStyle;
}

const filledSurface = (options: LayerOptions, shades: Shades): Surface => ({
  base: { backgroundColor: shades.base },
  hover: fillStyle("gradient", {
    cell: options.cell,
    color: shades.dark,
    edge: "bottom",
    from: 1,
    length: cells(options.rows, 0.8),
    to: 0,
  }),
  rest: [
    { ...shadeLayer(options, shades.dark), opacity: 0.5 },
    highlight(options, shades.light, 0.2, 0.6),
  ],
});

// Outline: the plain colour, sparse at rest and denser as you act.
const outlineSurface = (options: LayerOptions, shades: Shades): Surface => {
  const { cell, rows, fill } = options;
  const rest =
    fill === "dotted" || fill === "hatched"
      ? { ...fillStyle(fill, { cell, color: shades.base }), opacity: 0.32 }
      : fillStyle("gradient", {
          cell,
          color: shades.base,
          edge: "bottom",
          from: fill === "solid" ? 0.15 : 0.3,
          length: cells(rows, 0.45),
          to: 0,
        });
  return {
    base: {
      backgroundColor: `color-mix(in oklab, ${shades.base} 9%, transparent)`,
    },
    hover: {
      ...fillStyle("gradient", {
        cell,
        color: shades.base,
        edge: "bottom",
        from: 0.75,
        length: cells(rows, 0.9),
        to: 0.0625,
      }),
      "--dcn-btn-on": "0.7",
    },
    rest: [rest],
  };
};

const STYLES = [
  ".dcn-btn-hover{opacity:0}",
  ".dcn-btn-hover,.dcn-btn-rest{transition:opacity 220ms cubic-bezier(0.23,1,0.32,1)}",
  "@media (hover:hover){.dcn-btn:hover .dcn-btn-hover{opacity:var(--dcn-btn-on,1)}}",
  ".dcn-btn:focus-visible .dcn-btn-hover{opacity:var(--dcn-btn-on,1)}",
  ".dcn-btn:active .dcn-btn-hover{opacity:0;transition-duration:80ms}",
  ".dcn-btn:active .dcn-btn-rest{opacity:0.35;transition-duration:80ms}",
  "@media (prefers-reduced-motion:reduce){.dcn-btn-hover,.dcn-btn-rest{transition:none}}",
].join("");

const edgeStyle = (variant: DitherButtonVariant, color: DitherColor): CSSProperties => {
  const ink = cssColor(color);
  if (variant === "outline") {
    return {
      boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${ink} 55%, transparent)`,
    };
  }
  // A darker hairline holds the edge on any background; the top lip catches the light.
  return {
    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${ink}, black 30%), inset 0 1px 0 color-mix(in oklab, ${ink}, white 55%)`,
  };
};

const LAYER = "absolute inset-0 rounded-[inherit]";

interface FillProps extends LayerOptions {
  variant: DitherButtonVariant;
  color: DitherColor;
  bloom: Bloom;
}

const Fill = ({ variant, color, bloom, ...options }: FillProps) => {
  const shades = shadesOf(color);
  const surface =
    variant === "filled" ? filledSurface(options, shades) : outlineSurface(options, shades);
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit]"
      style={variant === "filled" ? bloomStyle(color, bloom) : undefined}
    >
      <style href="dithercn-dither-button" precedence="dithercn">
        {STYLES}
      </style>
      <span className={LAYER} style={surface.base} />
      <span className={LAYER} style={FRAME}>
        <span className={cn(LAYER, "dcn-btn-rest")}>
          {surface.rest.map((style, index) => (
            // The rest layers are fixed in number and order per variant.
            // oxlint-disable-next-line no-array-index-key
            <span key={index} className={LAYER} style={style} />
          ))}
        </span>
        <span className={cn(LAYER, "dcn-btn-hover")} style={surface.hover} />
      </span>
      {/* The edge goes over the fill; an inset shadow on the root would sit under it. */}
      <span className={LAYER} style={edgeStyle(variant, color)} />
    </span>
  );
};

interface OwnProps {
  /** `filled` is the lit colour surface; `outline` is a faint tint that fills in on hover. Default `"filled"`. */
  variant?: DitherButtonVariant;
  /** Texture of the shade: a Bayer ramp, a dot lattice, diagonals, or a thin rim. Default `"gradient"`. */
  fill?: FillVariant;
  /** A palette name or any CSS colour. Default `"ink"`. */
  color?: DitherColor;
  /** Default `"md"`. `icon` is a square for a lone icon; give it an `aria-label`. */
  size?: DitherButtonSize;
  /** A soft glow in the button's colour. Default `"off"`. */
  bloom?: Bloom;
  /** Size of one dither cell in CSS pixels. Default 2. */
  cell?: number;
  /** Show a busy state: the label stays, the button ignores clicks and reports `aria-busy`. Default `false`. */
  loading?: boolean;
  /** Render your own element (a link) with the button's look, as shadcn's `asChild`. Default `false`. */
  asChild?: boolean;
  children?: ReactNode;
}

export type DitherButtonProps = OwnProps & Omit<ComponentProps<"button">, "children" | "color">;

const rootClass = (
  variant: DitherButtonVariant,
  size: DitherButtonSize,
  className: string | undefined,
) =>
  cn(
    "dcn-btn group/button relative isolate inline-flex shrink-0 cursor-pointer items-center justify-center font-medium whitespace-nowrap select-none",
    "transition-[scale] duration-150 ease-(--ease-out) motion-safe:active:scale-[0.97]",
    // Filled: dark text on the bright dark-theme colours, light text on the deeper light-theme ones.
    variant === "filled"
      ? "text-white [text-shadow:0_1px_0_oklch(0_0_0/0.35)] dark:text-[oklch(0.13_0.02_268)] dark:[text-shadow:none]"
      : "text-foreground",
    // An outline, not a ring: the edge is an inline box-shadow and would hide a ring.
    "focus-visible:outline-ring outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid",
    "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
    "data-loading:cursor-progress",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    SIZE[size],
    className,
  );

/**
 * A real `<button>` with a lit, dithered surface in any palette colour: a
 * highlight dithered down from the top and a shade dithered up from the
 * bottom. Hover deepens the dither through the Bayer levels and press thins
 * it out. Four fills, two variants, four sizes, a loading state, and
 * `asChild` to put the look on a link.
 */
export const DitherButton = ({
  variant = "filled",
  fill = "gradient",
  color = "ink",
  size = "md",
  bloom = "off",
  cell = 2,
  loading = false,
  asChild = false,
  className,
  style,
  children,
  type,
  disabled,
  onClick,
  ...props
}: DitherButtonProps) => {
  const Comp = asChild ? Slot : "button";
  const step = Math.max(1, Math.round(cell));
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-fill={fill}
      data-loading={loading ? "" : undefined}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      // A link has no `type` or `disabled`; a button defaults to type="button".
      type={asChild ? undefined : (type ?? "button")}
      disabled={asChild ? undefined : disabled}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      {...props}
      className={rootClass(variant, size, className)}
      style={style}
    >
      <Fill
        variant={variant}
        bloom={bloom}
        fill={fill}
        color={color}
        cell={step}
        rows={Math.round(HEIGHT[size] / step)}
      />
      {loading ? (
        <span aria-hidden="true" className="contents">
          <Loader size="sm" color="currentColor" />
        </span>
      ) : null}
      <Slottable>{children}</Slottable>
    </Comp>
  );
};
