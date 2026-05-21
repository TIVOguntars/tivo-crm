import { cn } from "@/lib/utils";

export type CommBuckets = {
  call: [number, number];
  email: [number, number];
  chat: [number, number];
};

export function CommStats({
  counts,
  hasUnread = false,
}: {
  counts: CommBuckets | undefined;
  hasUnread?: boolean;
}) {
  const c = counts ?? {
    call: [0, 0] as [number, number],
    email: [0, 0] as [number, number],
    chat: [0, 0] as [number, number],
  };
  const items = [
    { icon: "📞", label: "Zvani", out: c.call[0], inn: c.call[1] },
    { icon: "✉️", label: "E-pasti", out: c.email[0], inn: c.email[1] },
    { icon: "💬", label: "Ziņas", out: c.chat[0], inn: c.chat[1] },
  ];
  return (
    <span className="inline-flex items-center gap-1.5 align-middle tabular-nums">
      {items.map((it) => {
        const empty = it.out === 0 && it.inn === 0;
        return (
          <span
            key={it.label}
            title={`${it.label}: izejošie ${it.out} / ienākošie ${it.inn}`}
            className={cn(
              "inline-flex items-center gap-0.5 leading-none",
              empty
                ? "text-muted-foreground/40"
                : hasUnread && it.inn > 0
                  ? "text-blue-600/90 dark:text-blue-300/90"
                  : "text-muted-foreground/80",
            )}
          >
            <span className="text-[10px]">{it.icon}</span>
            <span className="text-[10.5px]">
              {it.out}
              <span className="opacity-50">/</span>
              {it.inn}
            </span>
          </span>
        );
      })}
    </span>
  );
}