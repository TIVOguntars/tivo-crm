import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/palidziba")({
  component: HelpPage,
});

/**
 * Palīdzība — operatoru zināšanu bāze (statisks saturs frontendā).
 *
 * Struktūra: kategorijas → raksti. Kreisajā pusē sadaļu koks, labajā saturs.
 * Jaunu rakstu pievieno, papildinot attiecīgās kategorijas `articles` masīvu.
 * Rakstu ar `comingSoon: true` rāda kā "Drīzumā".
 */
type HelpBlock =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "list"; ordered?: boolean; intro?: string; items: string[] }
  | { kind: "note"; text: string };

type HelpArticle = {
  id: string;
  title: string;
  summary?: string;
  comingSoon?: boolean;
  blocks?: HelpBlock[];
};

type HelpCategory = {
  id: string;
  title: string;
  articles: HelpArticle[];
};

const soon = (id: string, title: string): HelpArticle => ({
  id,
  title,
  comingSoon: true,
});

const HELP_TREE: HelpCategory[] = [
  {
    id: "darba-vide",
    title: "Darba vide",
    articles: [
      {
        id: "darba-sadalu-nozime",
        title: "Darba sadaļu nozīme",
        summary: "Kurā sadaļā jāstrādā un kādam mērķim tā paredzēta.",
        blocks: [
          { kind: "heading", text: "Leadi" },
          { kind: "text", text: "Potenciālie klienti." },
          {
            kind: "list",
            intro: "Izmanto:",
            items: [
              "klientu kvalificēšanai",
              "statusu maiņai",
              "PPV piešķiršanai",
              "darba plānošanai",
            ],
          },
          { kind: "heading", text: "Objekti" },
          { kind: "text", text: "Konkrēti projekti." },
          {
            kind: "list",
            intro: "Izmanto:",
            items: [
              "projekta virzībai",
              "objekta statusu pārvaldībai",
              "projekta informācijas uzturēšanai",
            ],
          },
          { kind: "heading", text: "Uzdevumi" },
          { kind: "text", text: "Darbi, kas jāveic cilvēkam." },
          {
            kind: "list",
            intro: "Piemēri:",
            items: [
              "piezvanīt",
              "nosūtīt e-pastu",
              "nosūtīt WhatsApp",
              "nosūtīt SMS",
              "sagatavot piedāvājumu",
            ],
          },
          { kind: "note", text: "Ja darbu veic cilvēks, tas ir Uzdevums." },
          { kind: "heading", text: "Komunikācijas" },
          { kind: "text", text: "Visa saziņa ar klientu." },
          {
            kind: "list",
            intro: "Ietver:",
            items: ["e-pastus", "WhatsApp", "SMS", "zvanus", "piezīmes"],
          },
          { kind: "note", text: "Izmanto komunikācijas vēstures apskatei." },
          { kind: "heading", text: "SIS centrs" },
          { kind: "text", text: "Sistēmas automatizāciju pārvaldība." },
          {
            kind: "list",
            intro: "Izmanto:",
            items: [
              "sistēmas rindu apskatei",
              "kļūdu kontrolei",
              "sistēmas veselības uzraudzībai",
              "automatizāciju vēstures apskatei",
            ],
          },
          { kind: "note", text: "Ja darbu veic sistēma, tas ir SIS centrs." },
          { kind: "heading", text: "Import review" },
          { kind: "text", text: "Importēto datu pārbaude." },
          {
            kind: "list",
            intro: "Izmanto:",
            items: [
              "importa kļūdu labošanai",
              "neskaidru datu pārbaudei",
              "manuālu lēmumu pieņemšanai",
            ],
          },
        ],
      },
      {
        id: "uzdevumi-un-sis",
        title: "Uzdevumi un SIS centrs",
        summary: "Kā atšķirt cilvēka darbu no sistēmas darba.",
        blocks: [
          { kind: "heading", text: "Uzdevumi" },
          { kind: "text", text: 'Atbild uz jautājumu: "Kas jādara cilvēkam?"' },
          {
            kind: "list",
            intro: "Piemēri:",
            items: [
              "piezvanīt klientam",
              "nosūtīt e-pastu",
              "nosūtīt WhatsApp",
              "nosūtīt SMS",
              "sagatavot piedāvājumu",
              "pārbaudīt dokumentus",
            ],
          },
          { kind: "heading", text: "SIS centrs" },
          { kind: "text", text: 'Atbild uz jautājumu: "Ko dara sistēma?"' },
          {
            kind: "list",
            intro: "Piemēri:",
            items: [
              "e-pasts gaida nosūtīšanu",
              "WhatsApp gaida nosūtīšanu",
              "SMS gaida nosūtīšanu",
              "datu normalizēšana",
              "datu validācija",
              "prioritāšu pārrēķins",
              "importa apstrāde",
              "uzdevumu ģenerēšana",
            ],
          },
          { kind: "heading", text: "Galvenais princips" },
          {
            kind: "list",
            items: [
              "Ja darbu veic cilvēks → Uzdevumi",
              "Ja darbu veic sistēma → SIS centrs",
            ],
          },
        ],
      },
      {
        id: "darba-plusma",
        title: "Darba plūsma",
        summary: "Kā informācija plūst caur sistēmu.",
        blocks: [
          {
            kind: "list",
            ordered: true,
            items: [
              "Leads tiek saņemts.",
              "Leads tiek kvalificēts.",
              "Nepieciešamie darbi tiek veidoti Uzdevumos.",
              "Komunikācija tiek fiksēta Komunikācijās.",
              "Sistēmas automatizācijas strādā SIS centrā.",
              "Projekta darbs notiek Objektos.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "leadi",
    title: "Leadi",
    articles: [
      soon("leadi-dzives-cikls", "Lead dzīves cikls"),
      soon("leadi-prioritates", "Prioritātes"),
      soon("leadi-ppv", "PPV"),
      soon("leadi-tagi", "Tagi"),
    ],
  },
  {
    id: "objekti",
    title: "Objekti",
    articles: [
      soon("objekti-statusi", "Objektu statusi"),
      soon("objekti-darbs", "Darbs ar objektiem"),
      soon("objekti-vairaki", "Vairāki objekti vienam leadam"),
    ],
  },
  {
    id: "komunikacijas",
    title: "Komunikācijas",
    articles: [
      soon("kom-epasti", "E-pasti"),
      soon("kom-whatsapp", "WhatsApp"),
      soon("kom-sms", "SMS"),
      soon("kom-zvani", "Zvani"),
      soon("kom-piezimes", "Piezīmes"),
    ],
  },
  {
    id: "uzdevumi",
    title: "Uzdevumi",
    articles: [
      soon("uzd-veidi", "Uzdevumu veidi"),
      soon("uzd-prioritates", "Prioritātes"),
      soon("uzd-pabeigsana", "Uzdevuma pabeigšana"),
      soon("uzd-nakamas", "Nākamās darbības"),
    ],
  },
  {
    id: "sis-centrs",
    title: "SIS centrs",
    articles: [
      soon("sis-rindas", "Sistēmas rindas"),
      soon("sis-kludas", "Kļūdas"),
      soon("sis-veseliba", "Veselība"),
      soon("sis-vesture", "Vēsture"),
    ],
  },
  {
    id: "datu-imports",
    title: "Datu imports",
    articles: [
      soon("imp-review", "Import review"),
      soon("imp-dublikati", "Dublikāti"),
      soon("imp-validacija", "Datu validācija"),
      soon("imp-normalizesana", "Datu normalizēšana"),
    ],
  },
  {
    id: "biezakie-jautajumi",
    title: "Biežākie jautājumi",
    articles: [
      soon("faq-neredzu-leadu", "Kāpēc neredzu leadu?"),
      soon("faq-nav-uzdevums", "Kāpēc nav izveidots uzdevums?"),
      soon("faq-epasts", "Kāpēc e-pasts nenosūtījās?"),
      soon("faq-prioritate", "Kāpēc mainījās prioritāte?"),
    ],
  },
];

const ALL_ARTICLES = HELP_TREE.flatMap((c) =>
  c.articles.map((a) => ({ ...a, categoryTitle: c.title })),
);
const DEFAULT_ARTICLE_ID = ALL_ARTICLES[0]?.id ?? "";

function HelpBlockView({ block }: { block: HelpBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <h2 className="mt-1 text-sm font-semibold text-foreground">
          {block.text}
        </h2>
      );
    case "text":
      return <p className="text-sm text-muted-foreground">{block.text}</p>;
    case "note":
      return (
        <p className="rounded-md border-l-2 border-primary bg-secondary/50 px-3 py-2 text-sm font-medium text-foreground">
          {block.text}
        </p>
      );
    case "list":
      return (
        <div className="space-y-1">
          {block.intro ? (
            <p className="text-sm text-muted-foreground">{block.intro}</p>
          ) : null}
          {block.ordered ? (
            <ol className="list-decimal space-y-0.5 pl-5 text-sm text-foreground">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          ) : (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      );
    default:
      return null;
  }
}

function ComingSoon() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Drīzumā
      </span>
      <p className="mt-3 text-sm text-muted-foreground">
        Šī sadaļa tiks papildināta drīzumā.
      </p>
    </div>
  );
}

function HelpPage() {
  const [activeId, setActiveId] = React.useState(DEFAULT_ARTICLE_ID);
  const active =
    ALL_ARTICLES.find((a) => a.id === activeId) ?? ALL_ARTICLES[0];

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sadaļu koks kreisajā pusē */}
      <aside className="lg:w-72 lg:shrink-0">
        <div className="rounded-lg border border-border bg-card p-2">
          <nav className="flex flex-col gap-3">
            {HELP_TREE.map((category) => (
              <div key={category.id}>
                <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {category.title}
                </p>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {category.articles.map((article) => {
                    const isActive = article.id === active?.id;
                    return (
                      <button
                        key={article.id}
                        type="button"
                        onClick={() => setActiveId(article.id)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                          isActive
                            ? "bg-secondary font-medium text-foreground"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                        )}
                      >
                        <span className="truncate">{article.title}</span>
                        {article.comingSoon ? (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Drīzumā
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Saturs labajā pusē */}
      <article className="min-w-0 flex-1">
        {active ? (
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {active.categoryTitle}
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              {active.title}
            </h1>
            {active.summary ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {active.summary}
              </p>
            ) : null}

            <div className="mt-6">
              {active.comingSoon || !active.blocks ? (
                <ComingSoon />
              ) : (
                <div className="flex flex-col gap-3">
                  {active.blocks.map((block, i) => (
                    <HelpBlockView key={i} block={block} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}