import { useState, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Phone,
  MessageCircle,
  Mail,
  CheckSquare,
  StickyNote,
  CalendarClock,
  User,
  Globe2,
  MoreHorizontal,
  Save,
  Send,
  Combine,
  Plus,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { fetchCrmView } from "@/server/analytics";
import { cn } from "@/lib/utils";
import { Tag, normalizeTags } from "@/components/ui/Tag";
import { LoadingState } from "@/components/DataState";
import { CompleteActionModal } from "@/components/CompleteActionModal";

const LeadCommunicationTimeline = lazy(() =>
  import("@/components/LeadCommunicationTimeline").then((m) => ({
    default: m.LeadCommunicationTimeline,
  })),
);
const LeadActionHistory = lazy(() =>
  import("@/components/LeadActionHistory").then((m) => ({
    default: m.LeadActionHistory,
  })),
);
const LeadProjects = lazy(() =>
  import("@/components/LeadProjects").then((m) => ({
    default: m.LeadProjects,
  })),
);

/* ----------------------------- helpers ----------------------------- */

type Row = Record<string, unknown>;

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function b(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "t" || v === "1";
  return !!v;
}
function parseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value))
    return value.map((t) => String(t).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
function parseDate(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}
const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

function relativeTime(v: unknown): string {
  const t = parseDate(v);
  if (t == null) return "—";
  const diff = Date.now() - t;
  if (diff < 0) {
    const ahead = -diff;
    if (ahead < MS_HOUR)
      return `pēc ${Math.max(1, Math.round(ahead / MS_MIN))}m`;
    if (ahead < MS_DAY) return `pēc ${Math.round(ahead / MS_HOUR)}h`;
    return `pēc ${Math.round(ahead / MS_DAY)}d`;
  }
  if (diff < 5 * MS_MIN) return "tikko";
  if (diff < MS_HOUR) return `pirms ${Math.round(diff / MS_MIN)}m`;
  if (diff < 6 * MS_HOUR) return `pirms ${Math.round(diff / MS_HOUR)}h`;
  const now = new Date();
  const then = new Date(t);
  const sameDay =
    now.getFullYear() === then.getFullYear() &&
    now.getMonth() === then.getMonth() &&
    now.getDate() === then.getDate();
  if (sameDay) return "šodien";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (
    yest.getFullYear() === then.getFullYear() &&
    yest.getMonth() === then.getMonth() &&
    yest.getDate() === then.getDate()
  )
    return "vakar";
  const days = Math.round(diff / MS_DAY);
  if (days < 30) return `pirms ${days}d`;
  if (days < 365) return `pirms ${Math.round(days / 30)}mēn`;
  return `pirms ${Math.round(days / 365)}g`;
}

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v.trim(),
  );
}
function leadDisplayName(row: Row, leadId: string | null): string {
  const n = s(row.name) || s(row.object_name) || s(row.display_name);
  if (n && !isUuidLike(n)) return n;
  return leadId ? `Leads #${leadId.slice(0, 6)}` : "—";
}
function initials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "—";
}

/* ----------------------------- component ----------------------------- */

export function LeadDrawer({
  leadId,
  open,
  onOpenChange,
  onActionCompleted,
  onPatch,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionCompleted?: (leadId: string) => void;
  onPatch?: (leadId: string, patch: Record<string, unknown>) => void;
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

  // Layout-only step: never block drawer rendering on missing/failing
  // crm.lead_drawer_summary. If the view doesn't exist or returns no row,
  // render the drawer shell with empty section states.
  const row: Row = (view.data?.rows?.[0] as Row | undefined) ?? {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[92vw] md:max-w-[1100px] xl:max-w-[1280px]"
      >
        <DrawerBody
          row={row}
          leadId={leadId}
          loading={view.isLoading}
          onActionCompleted={onActionCompleted}
          onPatch={onPatch}
        />
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  row,
  leadId,
  loading,
  onActionCompleted,
  onPatch,
}: {
  row: Row;
  leadId: string | null;
  loading: boolean;
  onActionCompleted?: (leadId: string) => void;
  onPatch?: (leadId: string, patch: Record<string, unknown>) => void;
}) {
  const [completeOpen, setCompleteOpen] = useState(false);

  const scrollToSection = (id: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(`lead-section-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Optimistic local overrides (status/owner). Drawer reflects them immediately
  // and propagates to the parent table via onPatch.
  const [localPatch, setLocalPatch] = useState<Record<string, unknown>>({});
  const applyPatch = (patch: Record<string, unknown>) => {
    setLocalPatch((prev) => ({ ...prev, ...patch }));
    if (realLeadId && onPatch) onPatch(realLeadId, patch);
  };

  const realLeadId = s(row.lead_id) || leadId;
  const displayName = leadDisplayName(row, realLeadId);
  const status = s(localPatch.status ?? row.lead_status_label);
  // priority_label vairs neizmantojam — prioritāti rāda tikai zvaigznes + reitings.
  const owner = s(localPatch.owner ?? row.visible_action_owner);
  const ppv = s(localPatch.ppv ?? row.ppv_name);
  const country = s(row.country);
  const tags = parseTags(row.tags);
  const phoneE164 = s(row.telefons_e164) || s(row.phone_e164);
  const phoneRaw =
    s(row.telefons_raw) ||
    s(row.phone_raw) ||
    s(row.telefons_neapstradats) ||
    s(row.telefons);
  const phone = phoneE164 || phoneRaw;
  const email = s(row.email_normalized);
  const source = s(row.source);
  const importSource = s(row.import_source) || s(row.lead_source);

  const visibleAction = s(row.visible_action);
  const visibleDue = s(row.visible_action_due_at);
  const isHumanPrimary = b(row.visible_action_is_human);
  const sisLabel = s(row.system_action_label);
  const sisDue = s(row.system_due_date);

  const lastContact =
    s(row.last_contact_date) ||
    s(row.last_communication_at) ||
    s(row.last_inbound_at);
  const lastReply = s(row.last_inbound_at) || s(row.last_reply_at);
  const unreadReplies = s(row.unread_replies) || s(row.unread_count);
  const nextFollowup = visibleDue || sisDue;

  const waPhone = phone.replace(/[^0-9]/g, "");

  return (
    <TooltipProvider delayDuration={150}>
      {/* ============== STICKY HEADER ============== */}
      <SheetHeader className="space-y-2 border-b border-border bg-card px-4 pb-3 pt-4 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <SheetTitle className="truncate text-base font-semibold leading-tight">
                {displayName}
              </SheetTitle>
              {status && <StatusBadge status={status} />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <a
                    href={`tel:${phone}`}
                    className="text-foreground hover:underline"
                  >
                    {phone}
                  </a>
                </span>
              )}
              {email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <a
                    href={`mailto:${email}`}
                    className="truncate text-foreground hover:underline"
                  >
                    {email}
                  </a>
                </span>
              )}
              {country && (
                <span className="inline-flex items-center gap-1">
                  <Globe2 className="h-3 w-3" />
                  {country}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IconBtn
              icon={<Phone className="h-3.5 w-3.5" />}
              label="Zvanīt"
              href={phone ? `tel:${phone}` : undefined}
            />
            <IconBtn
              icon={<MessageCircle className="h-3.5 w-3.5" />}
              label="WhatsApp"
              href={waPhone ? `https://wa.me/${waPhone}` : undefined}
            />
            <IconBtn
              icon={<Mail className="h-3.5 w-3.5" />}
              label="E-pasts"
              href={email ? `mailto:${email}` : undefined}
            />
            <IconBtn
              icon={<CheckSquare className="h-3.5 w-3.5" />}
              label="Izveidot uzdevumu"
              onClick={() => setCompleteOpen(true)}
              disabled={!realLeadId}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Vairāk"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem>Pievienot tagu</DropdownMenuItem>
                <DropdownMenuItem>Mainīt atbildīgo</DropdownMenuItem>
                <DropdownMenuItem>Pārcelt termiņu</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  Apvienot ar...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* meta chips */}
        <div className="flex flex-wrap items-center gap-1">
          {owner && (
            <Chip>
              <User className="h-3 w-3" />
              <span className="font-medium">{owner}</span>
            </Chip>
          )}
          {ppv && (
            <Chip>
              <Sparkles className="h-3 w-3" />
              <span>PPV: {ppv}</span>
            </Chip>
          )}
          {/* Prioritātes līmeņi (Zema/Normāla/Augsta) noņemti — prioritāti rāda tikai zvaigznes + reitings. */}
          {normalizeTags(tags).slice(0, 4).map((t) => (
            <Tag key={t} label={t} />
          ))}
          {tags.length > 4 && (
            <span className="text-[10px] text-muted-foreground">
              +{tags.length - 4}
            </span>
          )}
        </div>

        {/* quick actions row */}
        <div className="flex flex-wrap items-center gap-1 pt-1">
          <QuickAction icon={<StickyNote className="h-3 w-3" />} label="Piezīme" onClick={() => scrollToSection("timeline")} />
          <QuickAction icon={<Phone className="h-3 w-3" />} label="Zvans" href={phone ? `tel:${phone}` : undefined} />
          <QuickAction
            icon={<MessageCircle className="h-3 w-3" />}
            label="WhatsApp"
            href={waPhone ? `https://wa.me/${waPhone}` : undefined}
          />
          <QuickAction icon={<Mail className="h-3 w-3" />} label="Email" href={email ? `mailto:${email}` : undefined} />
          <QuickAction
            icon={<CheckSquare className="h-3 w-3" />}
            label="Uzdevums"
            onClick={() => setCompleteOpen(true)}
            disabled={!realLeadId}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded border border-border bg-background px-2 text-[11px] font-medium text-foreground hover:bg-muted/60"
              >
                Mainīt statusu
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {[
                "Jauns",
                "Sarunās",
                "Pieprasījums",
                "Piedāvājums",
                "Līgums",
                "Nesasniedzams",
                "Zaudēts",
              ].map((st) => (
                <DropdownMenuItem key={st} onSelect={() => applyPatch({ status: st })}>{st}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SheetHeader>

      {/* ============== SCROLLABLE SECTION CONTENT ============== */}
      <div id="lead-drawer-scroll" className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] px-4 py-4 md:px-6 md:py-5">
          {loading && (
            <div className="mb-4">
              <LoadingState label="Ielādē lead datus…" />
            </div>
          )}

          {/* 2. Communication Summary */}
          <SectionBlock id="communication" title="Komunikācijas kopsavilkums">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
              <SummaryTile label="Zvani" value="—" />
              <SummaryTile label="E-pasti" value="—" />
              <SummaryTile label="SMS" value="—" />
              <SummaryTile label="WhatsApp" value="—" />
              <SummaryTile label="Atbildes" value={unreadReplies || "—"} />
              <SummaryTile label="Klikšķi" value="—" />
              <SummaryTile
                label="Pēdējā aktivitāte"
                value={lastContact ? relativeTime(lastContact) : "—"}
              />
            </div>
          </SectionBlock>

          {/* Desktop: 2-column grid for mid sections */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            {/* 4. Next Actions */}
            <SectionBlock id="next-actions" title="Nākamās darbības">
              <NextActionsBlock
                visibleAction={visibleAction}
                visibleDue={visibleDue}
                isHumanPrimary={isHumanPrimary}
                sisLabel={sisLabel}
                sisDue={sisDue}
              />
            </SectionBlock>

            {/* 5. Contact Data */}
            <SectionBlock id="contact" title="Kontaktdati">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <KeyVal k="Telefons (E.164)" v={phoneE164 || "—"} />
                <KeyVal k="Telefons (oriģ.)" v={phoneRaw || "—"} />
                <KeyVal k="E-pasts" v={email || "—"} />
                <KeyVal k="Validācija" v="—" />
                <KeyVal k="Līnijas tips" v="—" />
                <KeyVal k="Opt-in / Opt-out" v="—" />
              </div>
            </SectionBlock>
          </div>

          {/* 6. Object / Project */}
          <SectionBlock id="project" title="Objekts / Projekts">
            <Suspense fallback={<LoadingState label="Ielādē projektus…" />}>
              <LeadProjects leadId={realLeadId} />
            </Suspense>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              <SummaryTile label="Projekta status" value="—" />
              <SummaryTile label="Zeme" value="—" />
              <SummaryTile label="Stadija" value="—" />
              <SummaryTile label="Plānotais būvn." value="—" />
            </div>
          </SectionBlock>

          {/* 3. Timeline */}
          <SectionBlock id="timeline" title="Aktivitāšu laika līnija">
            <div className="rounded-md border border-border bg-card">
              <Suspense fallback={<div className="p-3"><LoadingState /></div>}>
                <div className="px-3 py-2">
                  <LeadCommunicationTimeline leadId={realLeadId} />
                </div>
              </Suspense>
            </div>
            <div className="mt-2 rounded-md border border-border bg-card">
              <Suspense fallback={<div className="p-3"><LoadingState /></div>}>
                <div className="px-3 py-2">
                  <LeadActionHistory leadId={realLeadId} />
                </div>
              </Suspense>
            </div>
          </SectionBlock>

          {/* 7. Raw / Audit / Import */}
          <SectionBlock id="audit" title="Raw / Audit / Import">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <KeyVal k="Importa avots" v={importSource || "—"} />
                <KeyVal k="Avots" v={source || "—"} />
                <KeyVal k="Konflikti" v="—" />
              </div>
              <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
                Raw payload preview un audit vēsture vēl nav pieslēgta.
              </div>
            </div>
          </SectionBlock>
        </div>
      </div>

      {/* ============== STICKY BOTTOM BAR ============== */}
      <footer className="flex shrink-0 items-center gap-1 border-t border-border bg-card px-3 py-2">
        <Button size="sm" className="h-7 gap-1 text-xs">
          <Save className="h-3.5 w-3.5" />
          Saglabāt
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
              Mainīt statusu
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {[
              "Jauns",
              "Sarunās",
              "Pieprasījums",
              "Piedāvājums",
              "Līgums",
              "Nesasniedzams",
              "Zaudēts",
            ].map((st) => (
              <DropdownMenuItem key={st} onSelect={() => applyPatch({ status: st })}>{st}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={() => setCompleteOpen(true)}
            disabled={!realLeadId}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Uzdevums
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={() => scrollToSection("timeline")}
          >
            <Send className="h-3.5 w-3.5" />
            Sūtīt ziņu
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
            <Combine className="h-3.5 w-3.5" />
            Merge
          </Button>
        </div>
      </footer>

      <CompleteActionModal
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        leadId={realLeadId}
        defaultOwner={owner}
        isHumanPrimary={isHumanPrimary}
        visibleAction={visibleAction}
        onCompleted={() => {
          if (realLeadId && onActionCompleted) onActionCompleted(realLeadId);
        }}
      />
    </TooltipProvider>
  );
}

/* ----------------------------- subcomponents ----------------------------- */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded border border-border bg-background px-1.5 text-[11px] text-foreground">
      {children}
    </span>
  );
}

function IconBtn({
  icon,
  label,
  href,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const isDisabled = disabled || (!href && !onClick);
  const cls = cn(
    "inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors",
    isDisabled
      ? "cursor-not-allowed opacity-40"
      : "hover:bg-muted hover:text-foreground",
  );
  const inner = href && !isDisabled ? (
    <a href={href} className={cls} aria-label={label}>
      {icon}
    </a>
  ) : (
    <button type="button" onClick={onClick} disabled={isDisabled} className={cls} aria-label={label}>
      {icon}
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function QuickAction({
  icon,
  label,
  href,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const isDisabled = disabled || (!href && !onClick);
  const cls = cn(
    "inline-flex h-7 items-center gap-1.5 rounded border border-border bg-background px-2 text-[11px] font-medium transition-colors",
    isDisabled
      ? "cursor-not-allowed opacity-40 text-muted-foreground"
      : "text-foreground hover:bg-muted/60",
  );
  if (href && !isDisabled) {
    return (
      <a href={href} className={cls}>
        {icon}
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={isDisabled} className={cls}>
      {icon}
      {label}
    </button>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function SectionBlock({
  id,
  title,
  right,
  children,
}: {
  id: string;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={`lead-section-${id}`} className="mb-5 scroll-mt-4">
      <div className="mb-2 flex items-center justify-between border-b border-border/60 pb-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function NextActionsBlock({
  visibleAction,
  visibleDue,
  isHumanPrimary,
  sisLabel,
  sisDue,
}: {
  visibleAction: string;
  visibleDue: string;
  isHumanPrimary: boolean;
  sisLabel: string;
  sisDue: string;
}) {
  const dueT = parseDate(visibleDue);
  const overdue = dueT != null && dueT < Date.now();
  const today =
    dueT != null &&
    new Date(dueT).toDateString() === new Date().toDateString();

  return (
    <div className="space-y-2">
      {visibleAction ? (
        <div
          className={cn(
            "rounded-md border px-3 py-2",
            overdue
              ? "border-rose-500/40 bg-rose-500/5"
              : today
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border bg-card",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground">
                {visibleAction}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {visibleDue && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    {relativeTime(visibleDue)}
                  </span>
                )}
                {isHumanPrimary && (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Cilvēka darbība
                  </span>
                )}
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                overdue
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                  : today
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {overdue ? "Nokavēts" : today ? "Šodien" : "Plānots"}
            </span>
          </div>
        </div>
      ) : (
        <EmptyRow text="Nav plānotu darbību" />
      )}
      {sisLabel ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">SIS: </span>
          {sisLabel}
          {sisDue && <span className="ml-2">{relativeTime(sisDue)}</span>}
        </div>
      ) : (
        <EmptyRow text="Nav automātikas ieteikumu" />
      )}
      <EmptyRow text="Plānoto darbību saraksts vēl nav pieslēgts" />
    </div>
  );
}

function KeyVal({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1 text-xs last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium text-foreground">{v || "—"}</span>
    </div>
  );
}

/* ----------------------------- Overview tab ----------------------------- */

function OverviewTab(props: {
  status: string;
  owner: string;
  ppv: string;
  source: string;
  tags: string[];
  visibleAction: string;
  visibleDue: string;
  isHumanPrimary: boolean;
  sisLabel: string;
  sisDue: string;
  lastContact: string;
  lastReply: string;
  unreadReplies: string;
  nextFollowup: string;
  leadId: string | null;
}) {
  const dueT = parseDate(props.visibleDue);
  const overdue = dueT != null && dueT < Date.now();
  const today =
    dueT != null &&
    new Date(dueT).toDateString() === new Date().toDateString();

  return (
    <>
      <Section title="Lead kopsavilkums">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <KeyVal
            k="Statuss"
            v={
              props.status ? <StatusBadge status={props.status} /> : "—"
            }
          />
          <KeyVal
            k="Atbildīgais"
            v={
              props.owner ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold text-secondary-foreground">
                    {initials(props.owner)}
                  </span>
                  {props.owner}
                </span>
              ) : (
                "—"
              )
            }
          />
          <KeyVal k="PPV" v={props.ppv} />
          <KeyVal k="Avots" v={props.source} />
          <KeyVal
            k="Tagi"
            v={
              props.tags.length === 0 ? (
                "—"
              ) : (
                <div className="flex flex-wrap justify-end gap-1">
                  {normalizeTags(props.tags).map((t) => (
                    <Tag key={t} label={t} />
                  ))}
                </div>
              )
            }
          />
        </div>
      </Section>

      <Section title="Nākamās darbības">
        <div className="space-y-1.5">
          {props.visibleAction ? (
            <div
              className={cn(
                "rounded-md border px-3 py-2",
                overdue
                  ? "border-rose-500/40 bg-rose-500/5"
                  : today
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border bg-card",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">
                    {props.visibleAction}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {props.visibleDue && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {relativeTime(props.visibleDue)}
                      </span>
                    )}
                    {props.isHumanPrimary && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Cilvēka darbība
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    overdue
                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                      : today
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {overdue ? "Nokavēts" : today ? "Šodien" : "Plānots"}
                </span>
              </div>
            </div>
          ) : (
            <EmptyRow text="Nav plānotu darbību" />
          )}
          {props.sisLabel && (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">SIS: </span>
              {props.sisLabel}
              {props.sisDue && (
                <span className="ml-2">{relativeTime(props.sisDue)}</span>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="Komunikācijas kopsavilkums">
        <div className="grid grid-cols-2 gap-1.5">
          <SummaryTile
            label="Pēdējais kontakts"
            value={relativeTime(props.lastContact)}
          />
          <SummaryTile
            label="Pēdējā atbilde"
            value={relativeTime(props.lastReply)}
          />
          <SummaryTile
            label="Nelasītas atbildes"
            value={props.unreadReplies || "0"}
          />
          <SummaryTile
            label="Nākamais follow-up"
            value={relativeTime(props.nextFollowup)}
          />
        </div>
      </Section>

      <Section title="Piezīmes">
        <NotesPreview leadId={props.leadId} />
      </Section>
    </>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-2 text-center text-[11px] text-muted-foreground">
      {text}
    </div>
  );
}

function NotesPreview({ leadId }: { leadId: string | null }) {
  const q = useQuery({
    queryKey: ["crm", "action_history_notes", leadId ?? ""],
    queryFn: () =>
      fetchCrmView({
        data: {
          view: "action_history",
          query: `lead_id=eq.${encodeURIComponent(leadId ?? "")}&order=completed_at.desc&limit=5`,
        },
      }),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  if (!leadId) return <EmptyRow text="Nav piezīmju" />;
  if (q.isLoading)
    return (
      <div className="text-[11px] text-muted-foreground">Ielādē…</div>
    );
  const rows = (q.data?.rows ?? []) as Row[];
  if (rows.length === 0) return <EmptyRow text="Vēl nav piezīmju" />;

  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => {
        const note = s(r.note) || s(r.action_label) || s(r.outcome);
        if (!note) return null;
        return (
          <li
            key={i}
            className="rounded-md border border-border bg-card px-2.5 py-1.5"
          >
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span className="truncate">{s(r.action_owner) || "Sistēma"}</span>
              <span>{relativeTime(r.completed_at)}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-xs text-foreground">
              {note}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------------- Tasks tab ----------------------------- */

function TasksTab({
  leadId,
  visibleAction,
  visibleDue,
  owner,
  isHuman,
  sisLabel,
  sisDue,
  onComplete,
}: {
  leadId: string | null;
  visibleAction: string;
  visibleDue: string;
  owner: string;
  isHuman: boolean;
  sisLabel: string;
  sisDue: string;
  onComplete: () => void;
}) {
  const dueT = parseDate(visibleDue);
  const overdue = dueT != null && dueT < Date.now();
  const today =
    dueT != null &&
    new Date(dueT).toDateString() === new Date().toDateString();

  return (
    <div className="space-y-3">
      <Section title="Aktīvie uzdevumi">
        <ul className="space-y-1">
          {visibleAction ? (
            <TaskRow
              title={visibleAction}
              owner={owner}
              dueLabel={
                overdue
                  ? "Nokavēts"
                  : today
                    ? "Šodien"
                    : visibleDue
                      ? relativeTime(visibleDue)
                      : "—"
              }
              dueTone={overdue ? "danger" : today ? "warn" : "muted"}
              onCheck={onComplete}
              human={isHuman}
            />
          ) : (
            <EmptyRow text="Nav aktīvu uzdevumu" />
          )}
          {sisLabel && (
            <TaskRow
              title={sisLabel}
              owner="Sistēma"
              dueLabel={sisDue ? relativeTime(sisDue) : "—"}
              dueTone="muted"
              human={false}
            />
          )}
        </ul>
      </Section>

      <Section title="Vēsturiski uzdevumi">
        <Suspense fallback={<LoadingState />}>
          <LeadActionHistory leadId={leadId} />
        </Suspense>
      </Section>

      <div className="sticky bottom-0 -mx-4 mt-2 border-t border-border bg-background/95 px-4 py-2 backdrop-blur">
        <button
          type="button"
          onClick={onComplete}
          disabled={!leadId}
          className="inline-flex h-7 w-full items-center justify-center gap-1 rounded border border-dashed border-border bg-background text-xs font-medium text-foreground hover:bg-muted/60 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Jauns uzdevums
        </button>
      </div>
    </div>
  );
}

function TaskRow({
  title,
  owner,
  dueLabel,
  dueTone,
  onCheck,
  human,
}: {
  title: string;
  owner: string;
  dueLabel: string;
  dueTone: "danger" | "warn" | "muted";
  onCheck?: () => void;
  human?: boolean;
}) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
      <button
        type="button"
        onClick={onCheck}
        disabled={!onCheck}
        className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded border border-border text-transparent hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Pabeigt"
      >
        <CheckSquare className="h-3 w-3" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-foreground">
          {title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <User className="h-2.5 w-2.5" />
            {owner || "—"}
          </span>
          {human === false && (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              Auto
            </span>
          )}
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 self-center rounded px-1.5 py-0.5 text-[10px] font-semibold",
          dueTone === "danger"
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
            : dueTone === "warn"
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              : "bg-muted text-muted-foreground",
        )}
      >
        {dueLabel}
      </span>
    </li>
  );
}

/* ----------------------------- Data tab ----------------------------- */

function DataTab(props: {
  phoneE164: string;
  phoneRaw: string;
  email: string;
  source: string;
  country: string;
  importSource: string;
  owner: string;
  ppv: string;
}) {
  return (
    <Section title="Strukturētie dati">
      <div className="rounded-md border border-border bg-card px-3 py-2">
        <KeyVal k="Normalizēts telefons" v={props.phoneE164 || "—"} />
        <KeyVal k="Telefons (oriģ.)" v={props.phoneRaw || "—"} />
        <KeyVal k="Validēts e-pasts" v={props.email || "—"} />
        <KeyVal k="Avots" v={props.source} />
        <KeyVal k="Valsts" v={props.country} />
        <KeyVal k="Importa avots" v={props.importSource} />
        <KeyVal k="Atbildīgais" v={props.owner} />
        <KeyVal k="PPV" v={props.ppv} />
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Rāda tikai validētos un normalizētos CRM laukus. Neapstrādāti payload
        dati netiek attēloti.
      </p>
    </Section>
  );
}

/* ----------------------------- Communications tab ----------------------------- */

const COMPOSER_MODES = [
  { key: "email", label: "Email", icon: Mail },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "sms", label: "SMS", icon: Send },
  { key: "note", label: "Piezīme", icon: StickyNote },
] as const;
type ComposerMode = (typeof COMPOSER_MODES)[number]["key"];

function CommunicationsTab({
  leadId,
  hasEmail,
  hasPhone,
  onSent,
}: {
  leadId: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  onSent: () => void;
}) {
  const [mode, setMode] = useState<ComposerMode>("note");
  const [text, setText] = useState("");

  const isDisabled =
    (mode === "email" && !hasEmail) ||
    ((mode === "whatsapp" || mode === "sms") && !hasPhone);

  const placeholder =
    mode === "note"
      ? "Iekšēja piezīme komandai…"
      : mode === "email"
        ? "Email saturs…"
        : mode === "whatsapp"
          ? "WhatsApp ziņa…"
          : "SMS ziņa…";

  const submit = () => {
    if (!text.trim() || isDisabled) return;
    // Optimistic: clear composer + bump timestamps. Backend wiring TBD.
    setText("");
    onSent();
  };

  return (
    <div className="-mx-4 -my-3 flex h-[calc(100%+1.5rem)] flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <Suspense fallback={<LoadingState />}>
          <LeadCommunicationTimeline leadId={leadId} />
        </Suspense>
      </div>
      <div className="sticky bottom-0 border-t border-border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="mb-1.5 flex items-center gap-0.5">
          {COMPOSER_MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
                {m.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
            placeholder={isDisabled ? "Trūkst kontakta šim kanālam" : placeholder}
            disabled={isDisabled}
            rows={2}
            className="min-h-[44px] flex-1 resize-none rounded border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled
              className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground opacity-60"
              title="Drīzumā"
            >
              <Plus className="h-3 w-3" />
              Pielikums
            </button>
            <Button
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={submit}
              disabled={!text.trim() || isDisabled}
            >
              <Send className="h-3.5 w-3.5" />
              Sūtīt
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
