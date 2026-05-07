import { useQuery } from "@tanstack/react-query";
import { Phone, MessageSquare, Mail, MessageCircle, CheckCircle2, CalendarClock, Globe2, User } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { fetchCrmView } from "@/server/analytics";
import { cn } from "@/lib/utils";
import { LoadingState, ErrorState } from "@/components/DataState";
import { LeadCommunicationTimeline } from "@/components/LeadCommunicationTimeline";
import { LeadActionHistory } from "@/components/LeadActionHistory";
import { CompleteActionModal } from "@/components/CompleteActionModal";
import { useState } from "react";

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
  onActionCompleted,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionCompleted?: (leadId: string) => void;
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
          <DrawerContent
            row={row}
            leadId={leadId}
            onActionCompleted={onActionCompleted}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerContent({
  row,
  leadId,
  onActionCompleted,
}: {
  row: Row;
  leadId: string | null;
  onActionCompleted?: (leadId: string) => void;
}) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const fullName = s(row.full_name) || "—";
  const status = s(row.lead_status_label);
  const priority = s(row.priority_label);
  const score = n(row.lead_priority_score);
  const tags = parseTags(row.tags);
  const country = s(row.country);
  const ppv = s(row.ppv_name);
  const phoneE164 = s(row.telefons_e164) || s(row.phone_e164);
  const phoneRaw =
    s(row.telefons_raw) ||
    s(row.phone_raw) ||
    s(row.telefons_neapstradats) ||
    s(row.telefons);
  const phone = phoneE164 || phoneRaw;
  const email = s(row.email_normalized);

  const isHumanPrimary = b(row.visible_action_is_human);
  const visibleAction = s(row.visible_action);
  const visibleOwner = s(row.visible_action_owner);
  const visibleDue = s(row.visible_action_due_at);

  const hasSis = b(row.has_background_system_action);
  const sisLabel = s(row.system_action_label);
  const sisDue = s(row.system_due_date);

  const createdAt = s(row.lead_created_at) || s(row.created_at);
  const source = s(row.source);
  const rating = s(row.rating) || s(row.reitings);
  const ratingNum = Number(rating);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <SheetHeader className="border-b border-border bg-muted/30 px-6 py-4 text-left">
        <SheetTitle className="text-xl font-semibold tracking-tight">
          {fullName}
        </SheetTitle>
        {/* Row 1 — identifiers + meta on one line */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {ppv && (
            <Badge
              variant="outline"
              className="h-7 gap-1.5 rounded-md border-border bg-background px-2.5 text-[12px] font-semibold text-foreground"
            >
              <User className="h-3.5 w-3.5 text-primary" />
              {ppv}
            </Badge>
            )}
            {country && (
            <Badge
              variant="outline"
              className="h-7 gap-1.5 rounded-md border-border bg-background px-2.5 text-[12px] font-semibold text-foreground"
            >
              <Globe2 className="h-3.5 w-3.5 text-primary" />
              {country}
            </Badge>
            )}
            {status && (
            <Badge variant="secondary" className="h-7 rounded-md px-2 text-[11px] font-medium">
              {status}
            </Badge>
            )}
            <div className="inline-flex items-center gap-1">
              <PriorityBadge label={priority} />
              {score > 0 && (
                <span className="inline-flex h-6 items-center rounded bg-background px-2 text-[11px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border">
                  {score}
                </span>
              )}
            </div>
            {rating && Number.isFinite(ratingNum) && ratingNum > 0 && (
            <Badge
              variant="outline"
              className="h-7 rounded-md border-amber-500/40 bg-amber-50 px-2 text-[11px] font-semibold text-amber-700"
            >
              ★ {rating}
            </Badge>
            )}
          </div>
          {(source || createdAt) && (
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
              {source && (
                <span>
                  <span className="text-muted-foreground/70">Avots: </span>
                  <span className="font-medium text-foreground">{source}</span>
                </span>
              )}
              {createdAt && (
                <span>
                  <span className="text-muted-foreground/70">Izveidots: </span>
                  <span className="font-medium text-foreground">{fmtDateTime(createdAt)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Row 3 — tags */}
        {tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="inline-flex h-5 items-center rounded-sm bg-muted px-1.5 text-[10px] lowercase text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Row 4 — contacts */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <div className="inline-flex items-center gap-1.5">
            <Phone className="h-3 w-3 text-muted-foreground/70" />
            {phone ? (
              <a href={`tel:${phone}`} className="text-primary hover:underline">
                {phone}
              </a>
            ) : (
              <span className="text-muted-foreground">Nav telefona</span>
            )}
          </div>
          <div className="inline-flex items-center gap-1.5">
            <Mail className="h-3 w-3 text-muted-foreground/70" />
            {email ? (
              <a href={`mailto:${email}`} className="text-primary hover:underline">
                {email}
              </a>
            ) : (
              <span className="text-muted-foreground">Nav e-pasta</span>
            )}
          </div>
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
            <div className="text-lg font-semibold leading-tight text-foreground">
              {visibleAction || "—"}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {visibleDue && (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  {fmtDateTime(visibleDue)}
                </span>
              )}
              {visibleOwner && (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <User className="h-4 w-4 text-primary" />
                  {visibleOwner}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* SIS background */}
        {hasSis && (
          <section>
            <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
              SIS automatizācija
            </h3>
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
              <div className="text-foreground/80">{sisLabel || "—"}</div>
              {sisDue && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Fonā ieplānots: {fmtDateTime(sisDue)}
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
            <QuickBtn icon={<Phone className="h-3.5 w-3.5" />} label="Zvanīt" disabled={!phone} disabledTooltip="Nav telefona numura" />
            <QuickBtn icon={<MessageSquare className="h-3.5 w-3.5" />} label="SMS" disabled={!phone} disabledTooltip="Nav telefona numura" />
            <QuickBtn icon={<MessageCircle className="h-3.5 w-3.5" />} label="WhatsApp" disabled={!phone} disabledTooltip="Nav telefona numura" />
            <QuickBtn icon={<Mail className="h-3.5 w-3.5" />} label="E-pasts" disabled={!email} disabledTooltip="Nav e-pasta adreses" />
            {isHumanPrimary ? (
              <QuickBtn
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Pabeigt darbību"
                onClick={() => setCompleteOpen(true)}
                disabled={!leadId}
              />
            ) : (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <QuickBtn
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        label="Pabeigt darbību"
                        disabled
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Nav cilvēka darbības, ko pabeigt</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <QuickBtn icon={<CalendarClock className="h-3.5 w-3.5" />} label="Pārcelt termiņu" />
          </div>
        </section>

        {/* Tabs */}
        <Tabs defaultValue="komunikacija" className="pt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="komunikacija">Komunikācija</TabsTrigger>
            <TabsTrigger value="projekts">Projekts</TabsTrigger>
            <TabsTrigger value="vesture">Vēsture</TabsTrigger>
          </TabsList>
          <TabsContent value="komunikacija" className="mt-3">
            <LeadCommunicationTimeline leadId={leadId} />
          </TabsContent>
          <TabsContent value="projekts" className="mt-3">
            <ProjectPanel
              objekts={
                s(row.objekts) ||
                s(row.object) ||
                s(row.project) ||
                s(row.projekts) ||
                s(row.object_name)
              }
              items={[
                { label: "Objekts", value: s(row.objekts) || s(row.object) || s(row.project) || s(row.projekts) || s(row.object_name) },
                { label: "Valsts", value: country },
                { label: "Avots", value: source },
                { label: "Statuss", value: status },
                { label: "PPV", value: ppv },
              ]}
              tags={tags}
            />
          </TabsContent>
          <TabsContent value="vesture" className="mt-3">
            <LeadActionHistory leadId={s(row.lead_id) || leadId} />
          </TabsContent>
        </Tabs>
      </div>
      <CompleteActionModal
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        leadId={s(row.lead_id) || leadId}
        defaultOwner={visibleOwner}
        isHumanPrimary={isHumanPrimary}
        visibleAction={visibleAction}
        onCompleted={() => {
          if (leadId && onActionCompleted) onActionCompleted(leadId);
        }}
      />
    </div>
  );
}

function QuickBtn({
  icon,
  label,
  disabled,
  onClick,
  disabledTooltip,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  disabledTooltip?: string;
}) {
  const btn = (
    <Button
      variant="outline"
      size="sm"
      className="h-8 justify-start gap-1.5 text-xs font-normal disabled:opacity-50 disabled:cursor-not-allowed"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
  if (disabled && disabledTooltip) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{btn}</span>
          </TooltipTrigger>
          <TooltipContent>{disabledTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return btn;
}

function OverviewGrid({ items }: { items: { label: string; value: string }[] }) {
  const visible = items.filter((i) => i.value && i.value.trim().length > 0);
  if (visible.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
        Nav pārskata datu.
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
      {visible.map((i) => (
        <div key={i.label} className="rounded-md border border-border/60 bg-card px-3 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
            {i.label}
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-foreground break-words">
            {i.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProjectPanel({
  objekts,
  items,
  tags,
}: {
  objekts: string;
  items: { label: string; value: string }[];
  tags: string[];
}) {
  const visible = items.filter((i) => i.value && i.value.trim().length > 0);
  if (!objekts) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
        Projekta informācija vēl nav pievienota.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {visible.map((i) => (
          <div key={i.label} className="rounded-md border border-border/60 bg-card px-3 py-2">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
              {i.label}
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground break-words">
              {i.value}
            </dd>
          </div>
        ))}
      </dl>
      {tags.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
            Tagi
          </div>
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex h-5 items-center rounded-sm bg-muted px-1.5 text-[10px] lowercase text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

