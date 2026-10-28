"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { DitherButton } from "@/components/dithercn/dither-button";
import { SponsorPreview } from "@/components/sponsor-preview";
import { sponsorCheckout, type SponsorState } from "./actions";

export function SponsorForm({ available }: { available: boolean }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [state, action, pending] = useActionState<SponsorState, FormData>(sponsorCheckout, {});
  const fields = [
    {
      name: "name" as const,
      label: "Product name",
      placeholder: "Your product",
      value: name,
      set: setName,
      maxLength: 40,
    },
    {
      name: "description" as const,
      label: "Description",
      placeholder: "What does your product do?",
      value: description,
      set: setDescription,
      maxLength: 100,
    },
    {
      name: "url" as const,
      label: "Website",
      placeholder: "https://your-site.com",
      value: url,
      set: setUrl,
      maxLength: 500,
    },
  ];
  return (
    <div className="grid gap-8">
      <SponsorPreview
        sponsor={{
          id: 0,
          name: name.trim() || "Your product",
          description: description.trim() || "Your one-line description goes here.",
          url: url.trim() || "https://your-product.example",
        }}
      />
      <div id="sponsor-checkout" className="grid gap-5">
        {available ? (
          <p className="text-muted-foreground text-sm">Only 1 sponsor slot available</p>
        ) : (
          <p className="text-muted-foreground text-sm">The sponsor slot is currently taken.</p>
        )}
        {available && (
          <form
            action={action}
            className="mx-auto grid w-full max-w-xl gap-4 text-left"
            aria-describedby={state.error ? "sponsor-error" : undefined}
          >
            {fields.map((field) => (
              <label key={field.name} className="grid gap-2 text-sm">
                {field.label}
                <input
                  name={field.name}
                  type={field.name === "url" ? "url" : "text"}
                  value={field.value}
                  onChange={(event) => field.set(event.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  required
                  disabled={pending}
                  autoComplete="off"
                  aria-invalid={Boolean(state.fields?.[field.name]?.length) || undefined}
                  aria-describedby={
                    state.fields?.[field.name]?.length ? `sponsor-${field.name}-error` : undefined
                  }
                  className="border-border placeholder:text-muted-foreground focus-visible:border-foreground bg-secondary h-11 min-w-0 rounded-md border px-4 text-sm outline-none"
                />
                {state.fields?.[field.name]?.length && (
                  <p
                    id={`sponsor-${field.name}-error`}
                    role="alert"
                    className="text-dither-red text-sm"
                  >
                    {state.fields[field.name]?.join(" ")}
                  </p>
                )}
              </label>
            ))}
            {state.error && (
              <p id="sponsor-error" role="alert" className="text-dither-red text-sm">
                {state.error}
              </p>
            )}
            <DitherButton
              type="submit"
              size="lg"
              loading={pending}
              disabled={pending}
              className="mx-auto mt-2"
            >
              Continue to checkout
            </DitherButton>
            <p className="text-muted-foreground text-center text-xs">
              Billed monthly through Stripe, for businesses only. By continuing, you agree to the{" "}
              <Link href="/sponsor/terms" className="text-foreground underline">
                sponsorship terms
              </Link>
              .
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
