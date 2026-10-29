"use client";

import { cn } from "cn";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { DitherButton } from "@/components/dithercn/dither-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { type FeedbackState, sendFeedback } from "./actions";
import { REPORT_REASONS } from "./feedback-input";

const IDLE: FeedbackState = { status: "idle" };

export function FeedbackDialog({
  kind,
  className,
}: {
  kind: "report" | "feedback";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FeedbackState, FormData>(
    async (previous, form) => {
      // Read here rather than with usePathname, which would make every page wait for the client.
      form.set("page", window.location.pathname);
      const result = await sendFeedback(previous, form);

      if (result.status === "sent") {
        toast.success(kind === "report" ? "Report sent. Thanks." : "Feedback sent. Thanks.");
        setOpen(false);
      }

      return result;
    },
    IDLE,
  );
  const errors = state.status === "error" ? state.fields : undefined;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn("hover:text-foreground", className)}>
        {kind === "report" ? "Report" : "Feedback"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form action={action} className="grid gap-4 text-left">
          <DialogHeader>
            <DialogTitle>{kind === "report" ? "Report this skill" : "Send feedback"}</DialogTitle>
            <DialogDescription>Anonymous. Do not include personal information.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="kind" value={kind} />
          {kind === "report" && (
            <Field data-invalid={Boolean(errors?.reason?.length) || undefined}>
              <FieldLabel htmlFor="feedback-reason">Reason</FieldLabel>
              <NativeSelect
                id="feedback-reason"
                name="reason"
                required
                defaultValue=""
                disabled={pending}
                aria-invalid={Boolean(errors?.reason?.length) || undefined}
                className="w-full"
              >
                <NativeSelectOption value="" disabled>
                  Choose a reason
                </NativeSelectOption>
                {Object.entries(REPORT_REASONS).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError>{errors?.reason?.join(" ")}</FieldError>
            </Field>
          )}
          <Field data-invalid={Boolean(errors?.details?.length) || undefined}>
            <FieldLabel htmlFor="feedback-details">
              {kind === "report" ? "Details (optional)" : "What should we know?"}
            </FieldLabel>
            <Textarea
              id="feedback-details"
              name="details"
              rows={4}
              required={kind === "feedback"}
              maxLength={kind === "report" ? 1000 : 2000}
              disabled={pending}
              aria-invalid={Boolean(errors?.details?.length) || undefined}
            />
            <FieldError>{errors?.details?.join(" ")}</FieldError>
          </Field>
          {state.status === "error" && state.message && <FieldError>{state.message}</FieldError>}
          <div className="flex justify-end gap-3">
            <DitherButton type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </DitherButton>
            <DitherButton type="submit" size="sm" loading={pending} disabled={pending}>
              Send
            </DitherButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
