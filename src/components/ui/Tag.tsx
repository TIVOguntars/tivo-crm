import * as React from "react";
import { cn } from "@/lib/utils";
import { TAG_BASE_CLASS, TAG_STYLES } from "@/design/tag-system";

export type TagVariant = keyof typeof TAG_STYLES;

/**
 * Map a free-form tag label to a known TAG_STYLES variant.
 * Falls back to "default".
 */
export function resolveTagVariant(label: string): TagVariant {
  const t = label.trim().toLowerCase();
  if (!t) return "default";
  if (/^(hot|karst)/.test(t)) return "hot";
  if (/get.?estimate|tame|aprekin/.test(t)) return "getestimate";
  if (/(sketch|skice|skiс)/.test(t)) return "sketch";
  if (/(warn|konflikt|brid|attention)/.test(t)) return "warning";
  if (/(success|ok|done|pabeig|sasniedz)/.test(t)) return "success";
  if (/(info|piezim|note)/.test(t)) return "info";
  if (t in TAG_STYLES) return t as TagVariant;
  return "default";
}

/** Normalize a list of tags: trim, lowercase, dedupe, drop empty. */
export function normalizeTags(tags: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (raw == null) continue;
    const t = String(raw).trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
  variant?: TagVariant;
}

export function Tag({ label, variant, className, ...rest }: TagProps) {
  const v = variant ?? resolveTagVariant(label);
  const style = TAG_STYLES[v] ?? TAG_STYLES.default;
  return (
    <span
      className={cn(TAG_BASE_CLASS, style.bg, style.text, className)}
      {...rest}
    >
      {label}
    </span>
  );
}

export default Tag;