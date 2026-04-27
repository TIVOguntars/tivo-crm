import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  retainSearchParams,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { zodValidator } from "@tanstack/zod-adapter";

import appCss from "../styles.css?url";
import { TopNav } from "@/components/TopNav";
import { FilterBar } from "../components/FilterBar";
import { filtersSearchSchema } from "@/lib/filters";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Lapa nav atrasta</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pieprasītā lapa neeksistē vai ir pārvietota.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Uz sākumu
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: zodValidator(filtersSearchSchema),
  search: {
    middlewares: [
      retainSearchParams([
        "range",
        "from",
        "to",
        "countries",
        "sources",
        "owners",
        "ppvs",
      ]),
    ],
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Analītikas panelis" },
      { name: "description", content: "Lasāmrežīma analītikas dashboard" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Analītikas panelis" },
      { property: "og:description", content: "Lasāmrežīma analītikas dashboard" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        <TopNav />
        <FilterBar />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  );
}
