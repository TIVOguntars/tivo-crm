import { AlertTriangle, Loader2, Inbox } from "lucide-react";

export function LoadingState({ label = "Ielādē datus..." }: { label?: string }) {
  return (
    <div className="flex h-40 items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" />
        Neizdevās ielādēt datus
      </div>
      <p className="text-xs leading-relaxed text-destructive/80">{message}</p>
      <p className="text-xs text-muted-foreground">
        Pārliecinieties, ka <code className="rounded bg-muted px-1">analytics</code> shēma
        ir pievienota Supabase API → Exposed schemas un ka nepieciešamie skati ir izveidoti.
      </p>
    </div>
  );
}

export function EmptyState({ label = "Nav datu, ko parādīt." }: { label?: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card text-sm text-muted-foreground">
      <Inbox className="h-5 w-5" />
      {label}
    </div>
  );
}