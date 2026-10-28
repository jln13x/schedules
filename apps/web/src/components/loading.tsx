import { Loader } from "@/components/dithercn/loader";

/** The fallback for a page or section that is still loading. */
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="grid min-h-96 place-items-center">
      <Loader size="sm" color="currentColor" label={label} />
    </div>
  );
}
