import { useQuery } from "@tanstack/react-query";
import { Phone, MessageSquare, Mail, MessageCircle, CheckCircle2, CalendarClock, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchCrmView } from "@/server/analytics";
import { cn } from "@/lib/utils";
import { LoadingState, ErrorState } from "@/components/DataState";
import { LeadCommunicationTimeline } from "@/components/LeadCommunicationTimeline";

type Row = Record<string, unknown>;

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function n(v: unknown): number {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}
function b(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "t" || v === "1";
  return !!v;
}
function parseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  return String(value).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function fmtDateTime(value: unknown): string {
  const str = s(value);
  if (!str) return "—";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function PriorityBadge({ label }: { label: string }) {
  if (!label) return null;
  const tone =
    label === "Augsta"
      ? "bg-red-600 text-white border-transparent"
      : label === "Normāla"
        ? "bg-orange-500 text-white border-transparent"
        : label === "Zema"
          ? "bg-slate-500 text-white border-transparent"
          : "";
  return (
    <Badge className={cn("h-6 rounded px-2 py-0 text-[11px] font-medium leading-none", tone)}>
      {label}
    </Badge>
  );
}

export function LeadDrawer({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const view = useQuery({
    queryKey: ["crm", "lead_drawer_summary", leadId ?? ""],
    queryFn: () =>
      fetchCrmView({
        data: {
          view: "lead_drawer_summary",
          query: `lead_id=eq.${encodeURIComponent(leadId ?? "")}&limit=1`,
        },
      }),
    enabled: open && !!leadId,
    staleTime: 30_000,
  });

  const row: Row | null = view.data?.rows?.[0] ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-none md:w-[40vw] md:min-w-[520px]"
      >
        {view.isLoading ? (
          <div className="p-6"><LoadingState /></div>
        ) : view.data?.error ? (
          <div className="p-6"><ErrorState message={view.data.error} /></div>
        ) : !row ? (
          <div className="p-6 text-sm text-muted-foreground">Nav datu šim leadam.</div>
        ) : (
          <DrawerContent row={row} leadId={leadId} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerContent({ row, leadId }: { row: Row; leadId: string | null }) {
  const fullName = s(row.full_name) || "—";
  const status = s(row.lead_status_label);
  const priority = s(row.priority_label);
  const score = n(row.lead_priority_score);
  const tags = parseTags(row.tags);
  const country = s(row.country);
  const ppv = s(row.ppv_name);
  const phone = s(row.telefons_e164);
  const email = s(row.email_normalized);

  const isHumanPrimary = b(row.visible_action_is_human);
  const visibleAction = s(row.visible_action);
  const visibleOwner = s(row.visible_action_owner);
  const visibleDue = s(row.visible_action_due_at);

  const hasSis = b(row.has_background_system_action);
  const sisLabel = s(row.system_action_label);
  const sisDue = s(row.system_due_date);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <SheetHeader className="border-b border-border bg-muted/30 px-6 py-4 text-left">
        <SheetTitle className="text-xl font-semibold tracking-tight">
          {fullName}
        </SheetTitle>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {status && (
            <Badge variant="secondary" className="h-6 rounded px-2 text-[11px] font-medium">
              {status}
            </Badge>
          )}
          <PriorityBadge label={priority} />
          {score > 0 && (
            <span className="inline-flex h-6 items-center rounded bg-background px-2 text-[11px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border">
              {score}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {country && <span><span className="text-muted-foreground/70">Valsts: </span>{country}</span>}
          {ppv && <span><span className="text-muted-foreground/70">PPV: </span>{ppv}</span>}
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="inline-flex h-5 items-center rounded-sm bg-muted px-1.5 text-[10px] lowercase text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {phone ? (
            <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Phone className="h-3 w-3" /> {phone}
            </a>
          ) : (
            <span className="text-muted-foreground">Nav telefona</span>
          )}
          {email ? (
            <a href={`mailto:${email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Mail className="h-3 w-3" /> {email}
            </a>
          ) : (
            <span className="text-muted-foreground">Nav e-pasta</span>
          )}
        </div>
      </SheetHeader>

      {/* Body */}
      <div className="flex-1 space-y-4 px-6 py-4">
        {/* Primary action */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Nākamā darbība
          </h3>
          <div className={cn(
            "rounded-lg border p-4",
            isHumanPrimary ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30",
          )}>
            <div className="text-base font-semibold text-foreground">
              {visibleAction || "—"}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {visibleOwner && <span><span className="text-muted-foreground/70">Atbildīgais: </span>{visibleOwner}</span>}
              {visibleDue && <span><span className="text-muted-foreground/70">Termiņš: </span>{fmtDateTime(visibleDue)}</span>}
            </div>
          </div>
        </section>

        {/* SIS background */}
        {hasSis && (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              SIS automatizācija
            </h3>
            <div className="rounded-md border border-dashed border-border bg-background p-3 text-xs">
              <div className="font-medium text-foreground">{sisLabel || "—"}</div>
              {sisDue && (
                <div className="mt-1 text-muted-foreground">
                  Termiņš: {fmtDateTime(sisDue)}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Quick actions */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ātrās darbības
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <QuickBtn icon={<Phone className="h-3.5 w-3.5" />} label="Zvanīt" />
            <QuickBtn icon={<MessageSquare className="h-3.5 w-3.5" />} label="SMS" />
            <QuickBtn icon={<MessageCircle className="h-3.5 w-3.5" />} label="WhatsApp" />
            <QuickBtn icon={<Mail className="h-3.5 w-3.5" />} label="E-pasts" />
            <QuickBtn icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Pabeigt darbību" />
            <QuickBtn icon={<CalendarClock className="h-3.5 w-3.5" />} label="Pārcelt termiņu" />
          </div>
        </section>

        {/* Tabs */}
        <Tabs defaultValue="parskats" className="pt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="parskats">Pārskats</TabsTrigger>
            <TabsTrigger value="komunikacija">Komunikācija</TabsTrigger>
            <TabsTrigger value="projekts">Projekts</TabsTrigger>
            <TabsTrigger value="vesture">Vēsture</TabsTrigger>
          </TabsList>
          <TabsContent value="parskats" className="mt-3 text-sm text-muted-foreground">
            Pārskata saturs tiks pievienots.
          </TabsContent>
          <TabsContent value="komunikacija" className="mt-3">
            <LeadCommunicationTimeline leadId={leadId} />
          </TabsContent>
          <TabsContent value="projekts" className="mt-3 text-sm text-muted-foreground">
            Projekta saturs tiks pievienots.
          </TabsContent>
          <TabsContent value="vesture" className="mt-3 text-sm text-muted-foreground">
            Vēstures saturs tiks pievienots.
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function QuickBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Button variant="outline" size="sm" className="h-8 justify-start gap-1.5 text-xs font-normal" type="button">
      {icon}
      {label}
    </Button>
  );
}
