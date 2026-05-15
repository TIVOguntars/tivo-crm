import * as React from "react";
import { createPortal } from "react-dom";

const HEADER_SLOT_ID = "lovable-header-slot";

export function HeaderSlotProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Mount this once inside the global header. Acts as a portal target. */
export function HeaderSlotOutlet({ className }: { className?: string }) {
  return <div id={HEADER_SLOT_ID} className={className} />;
}

/**
 * Render children into the global header slot for the lifetime of this component.
 * Uses a real DOM portal so React does not re-set state on every render.
 */
export function HeaderSlot({ children }: { children: React.ReactNode }) {
  const [el, setEl] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const find = () => {
      const node = document.getElementById(HEADER_SLOT_ID);
      if (node) {
        if (!cancelled) setEl(node);
        return true;
      }
      return false;
    };
    if (find()) return;
    // Outlet may mount on a later tick (e.g. first paint). Poll briefly.
    const id = window.setInterval(() => {
      if (find()) window.clearInterval(id);
    }, 30);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  if (!el) return null;
  return createPortal(children, el);
}