"use client";

import { cn } from "cn";
import * as React from "react";
import { Label } from "@/components/ui/label";

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="field"
      className={cn(
        "group/field data-[invalid=true]:text-destructive flex w-full flex-col gap-2",
        className,
      )}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn("flex w-fit gap-2 leading-snug", className)}
      {...props}
    />
  );
}

function FieldError({ className, children, ...props }: React.ComponentProps<"div">) {
  if (!children) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-destructive text-sm font-normal", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Field, FieldError, FieldLabel };
