import type { LucideIcon } from "lucide-react";
import type { GroupTone } from "@/config/menu";
import { cn } from "@/lib/format";

// Icon chip: ô vuông bo tròn nền nhạt + icon màu theo nhóm chức năng (bảng màu: --tone-* trong globals.css).
const box = { xs: "h-6 w-6", sm: "h-7 w-7", md: "h-8 w-8", lg: "h-9 w-9" } as const;
const glyph = { xs: 14, sm: 15, md: 16, lg: 18 } as const;

export function IconChip({ icon: Icon, tone, size = "sm", quiet, className }: { icon: LucideIcon; tone?: GroupTone; size?: keyof typeof box; quiet?: boolean; className?: string }) {
  return (
    <span className={cn("chip", tone && `tone-${tone}`, quiet && "chip-quiet", box[size], className)} aria-hidden>
      <Icon size={glyph[size]} strokeWidth={1.9} />
    </span>
  );
}
