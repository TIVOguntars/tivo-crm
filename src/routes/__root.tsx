import {
  Outlet,
  Link,
  useRouter,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  retainSearchParams,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { TopNav } from "@/components/TopNav";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/integrations/supabase/client";
import { filtersSearchSchema } from "@/lib/filters";
import { Toaster } from "@/components/ui/sonner";
import { HeaderSlotProvider } from "@/components/HeaderSlot";
import { OperatorPickerGate } from "@/components/operator/OperatorPicker";

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
      retainSearchParams(["range", "from", "to", "countries", "sources", "owners", "ppvs", "tags"]),
    ],
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TIVO CRM analītikas panelis" },
      { name: "description", content: "Lasāmrežīma analītikaspanelis, viss par TIVO leadiem." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "TIVO CRM analītikas panelis" },
      {
        property: "og:description",
        content: "Lasāmrežīma analītikaspanelis, viss par TIVO leadiem.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "TIVO CRM analītikas panelis" },
      {
        name: "twitter:description",
        content: "Lasāmrežīma analītikaspanelis, viss par TIVO leadiem.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d65e6a12-334a-48a4-b0b9-bd33eb43c65c/id-preview-cdaecc76--5646d708-71c1-4f9c-95d9-1cdd68b7439c.lovable.app-1777277918301.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d65e6a12-334a-48a4-b0b9-bd33eb43c65c/id-preview-cdaecc76--5646d708-71c1-4f9c-95d9-1cdd68b7439c.lovable.app-1777277918301.png",
      },
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
      <AuthStateInvalidator queryClient={queryClient} />
      <AuthGate>
        <OperatorPickerGate>
          <HeaderSlotProvider>
            <div className="min-h-screen bg-background text-foreground">
              <TopNav />
              <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
                <Outlet />
              </main>
              <Toaster position="top-right" />
            </div>
          </HeaderSlotProvider>
        </OperatorPickerGate>
      </AuthGate>
    </QueryClientProvider>
  );
}

function AuthStateInvalidator({ queryClient }: { queryClient: QueryClient }) {
  const router = useRouter();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (typeof window !== "undefined" && import.meta.env.DEV) {
        console.log("[auth-debug] auth provider root state invalidator", {
          event,
          authSession: {
            hasSession: !!session,
            userId: session?.user?.id ?? null,
            email: session?.user?.email ?? null,
          },
          currentUserId: session?.user?.id ?? null,
        });
      }
      // Only react to identity changes — TOKEN_REFRESHED / INITIAL_SESSION
      // fire frequently and must NOT wipe the cache (causes UI flicker).
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") {
        return;
      }
      queryClient.removeQueries({ queryKey: ["crm", "current_roles"] });
      void queryClient.invalidateQueries({ queryKey: ["crm"] });
      void router.invalidate();
    });
    return () => subscription.unsubscribe();
  }, [queryClient, router]);

  return null;
}
