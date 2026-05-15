import * as React from "react";

type Ctx = {
  node: React.ReactNode;
  setNode: (n: React.ReactNode) => void;
};

const HeaderSlotCtx = React.createContext<Ctx | null>(null);

export function HeaderSlotProvider({ children }: { children: React.ReactNode }) {
  const [node, setNode] = React.useState<React.ReactNode>(null);
  const value = React.useMemo(() => ({ node, setNode }), [node]);
  return <HeaderSlotCtx.Provider value={value}>{children}</HeaderSlotCtx.Provider>;
}

export function HeaderSlotOutlet({ className }: { className?: string }) {
  const ctx = React.useContext(HeaderSlotCtx);
  if (!ctx || !ctx.node) return null;
  return <div className={className}>{ctx.node}</div>;
}

/** Render arbitrary content into the global header slot for the lifetime of the caller. */
export function useHeaderSlot(node: React.ReactNode) {
  const ctx = React.useContext(HeaderSlotCtx);
  React.useEffect(() => {
    if (!ctx) return;
    ctx.setNode(node);
    return () => ctx.setNode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);
}