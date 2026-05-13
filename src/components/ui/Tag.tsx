import * as React from "react";
import { TAG_STYLES, TAG_BASE_CLASS } from "@/design/tag-system";

export type TagVariant = keyof typeof TAG_STYLES;

/**
 * Map a free-form tag label to a known TAG_STYLES variant.
 * Falls back to "default".
 */
export function resolveTagVariant(label: string): TagVariant {
  const t = label.trim().toLowerCase();
  if (!t) return "default";
  if (t in TAG_STYLES) return t as TagVariant;
  if (/^(hot|karst)/.test(t)) return "hot";
  if (/get.?estimate|tame|aprekin/.test(t)) return "getestimate";
  if (/(sketch|skice|skiс)/.test(t)) return "sketch";
  if (/(warn|konflikt|brid|attention)/.test(t)) return "warning";
  if (/(success|ok|done|pabeig|sasniedz)/.test(t)) return "success";
  if (/(info|piezim|note)/.test(t)) return "info";
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

export interface TagProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "className"> {
  /** Preferred prop. */
  tag?: string;
  /** Backwards-compatible alias for `tag`. */
  label?: string;
  variant?: TagVariant;
}

export function Tag({ tag, label, variant, ...rest }: TagProps) {
  const raw = (tag ?? label ?? "").toString();
  const normalizedTag = raw.trim().toLowerCase();
  const v = variant ?? resolveTagVariant(normalizedTag);
  const style = TAG_STYLES[v] ?? TAG_STYLES.default;
  return (
    <span
      {...rest}
      className={`${TAG_BASE_CLASS} ${style.bg} ${style.text}`}
    >
      {raw}
    </span>
  );
}

export default Tag;