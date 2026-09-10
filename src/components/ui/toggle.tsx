"use client";

import { useState } from "react";
import { cn } from "@/lib/format";

export function Toggle({
  defaultChecked = false,
  label,
  onChange,
}: {
  defaultChecked?: boolean;
  label?: string;
  onChange?: (v: boolean) => void;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        setOn(!on);
        onChange?.(!on);
      }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        on ? "bg-primary" : "bg-border-strong",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          on ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}
