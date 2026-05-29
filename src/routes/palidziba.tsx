import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/palidziba")({
  component: HelpPage,
});

/**
 * Operatoru rokasgrāmata — statisks saturs frontendā.
 * Jaunu lapu pievieno, papildinot `HELP_ARTICLES` masīvu.
 * Sadaļas kreisajā pusē, saturs labajā pusē. Bez sarežģītas struktūras.
 */
type HelpSection = {
  heading: string;
  /** Īss apraksts virs saraksta. */
  description?: string;
  /** Saraksta punkti. */
  items?: string[];
  /** Papildu īsa piezīme zem saraksta. */
  note?: string;
};

type HelpArticle = {
  id: string;
  title: string;
  summary: string;
  sections: HelpSection[];
};

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "darba-sadalu-nozime",
    title: "Darba sadaļu nozīme",
    summary: "Kurā sadaļā jāstrādā un kādam mērķim tā paredzēta.",
    sections: [
      {
        heading: "Leadi",
        description: "Potenciālie klienti.",
        items: [
          "klientu kvalificēšanai",
          "statusu maiņai",
          "PPV piešķiršanai",
          "darba plānošanai",
        ],
      },
      {
        heading: "Objekti",
        description: "Konkrēti projekti.",
        items: [
          "projekta virzībai",
          "objekta statusu pārvaldībai",
          "projekta informācijas uzturēšanai",
        ],
      },
      {
        heading: "Uzdevumi",
        description: "Darbi, kas jāveic cilvēkam.",
        items: [
          "piezvanīt",
          "nosūtīt e-pastu",
          "nosūtīt WhatsApp",
          "nosūtīt SMS",
          "sagatavot piedāvājumu",
        ],
        note: "Ja darbu veic cilvēks, tas ir Uzdevums.",
      },
      {
        heading: "Komunikācijas",
        description: "Visa saziņa ar klientu.",
        items: ["e-pastus", "WhatsApp", "SMS", "zvanus", "piezīmes"],
        note: "Izmanto komunikācijas vēstures apskatei.",
      },
      {
        heading: "SIS centrs",
        description: "Sistēmas automatizāciju pārvaldība.",
        items: [
          "sistēmas rindu apskatei",
          "kļūdu kontrolei",
          "sistēmas veselības uzraudzībai",
          "automatizāciju vēstures apskatei",
        ],
        note: "Ja darbu veic sistēma, tas ir SIS centrs.",
      },
      {
        heading: "Import review",
        description: "Importēto datu pārbaude.",
        items: [
          "importa kļūdu labošanai",
          "neskaidru datu pārbaudei",
          "manuālu lēmumu pieņemšanai",
        ],
      },
    ],
  },
];

function HelpPage() {
  const [activeId, setActiveId] = React.useState(HELP_ARTICLES[0]?.id ?? "");
  const active =
    HELP_ARTICLES.find((a) => a.id === activeId) ?? HELP_ARTICLES[0];

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sadaļas kreisajā pusē */}
      <aside className="lg:w-64 lg:shrink-0">
        <div className="rounded-lg border border-border bg-card p-2">
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Palīdzība
          </p>
          <nav className="mt-1 flex flex-col gap-0.5">
            {HELP_ARTICLES.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => setActiveId(article.id)}
                className={cn(
                  "rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  article.id === active?.id
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {article.title}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Saturs labajā pusē */}
      <article className="min-w-0 flex-1">
        {active ? (
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {active.title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {active.summary}
            </p>

            <div className="mt-6 flex flex-col gap-5">
              {active.sections.map((section) => (
                <section
                  key={section.heading}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <h2 className="text-sm font-semibold text-foreground">
                    {section.heading}
                  </h2>
                  {section.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {section.description}
                    </p>
                  ) : null}
                  {section.items && section.items.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-foreground">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.note ? (
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {section.note}
                    </p>
                  ) : null}
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}