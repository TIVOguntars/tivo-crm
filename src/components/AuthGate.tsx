import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
  clearAuth,
  INACTIVITY_LIMIT_MS,
  isSessionValid,
  setAuthenticated,
  touchActivity,
} from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { setStoredOperator } from "@/lib/users";

interface AuthGateProps {
  children: React.ReactNode;
}

const GENERIC_ERROR = "Nepareizi pieslēgšanās dati";

/** Public routes that bypass the auth gate. */
const PUBLIC_PATHS = new Set<string>(["/reset-password"]);

export function AuthGate({ children }: AuthGateProps) {
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [authed, setAuthed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [userCode, setUserCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial session check on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const user = data.user;
      const valid = isSessionValid();
      if (user && !user.is_anonymous && valid) {
        setAuthed(true);
      } else {
        if (user) {
          // Stale or anonymous session — clean it out.
          void supabase.auth.signOut().catch(() => {});
        }
        clearAuth();
        setAuthed(false);
      }
      setHydrated(true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user;
      if (u && !u.is_anonymous && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
        setAuthenticated();
        setAuthed(true);
      } else if (event === "SIGNED_OUT") {
        clearAuth();
        setAuthed(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    setAuthed(false);
    setPassword("");
    setUserCode("");
    setError(null);
    void supabase.auth.signOut().catch(() => {});
  }, []);

  // Activity tracking + inactivity timer (only when authed)
  useEffect(() => {
    if (!authed) return;

    const onActivity = () => touchActivity();
    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "click",
      "keydown",
      "scroll",
      "touchstart",
      "touchmove",
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    timerRef.current = setInterval(() => {
      if (!isSessionValid()) handleLogout();
    }, 30_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [authed, handleLogout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = userCode.trim();
    const pwd = password;
    if (!code || !pwd) {
      setError(GENERIC_ERROR);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // 1. Resolve email by user_code via secure RPC (returns null if not found / inactive).
      const sb = supabase as unknown as {
        schema: (s: string) => {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        };
      };
      const { data: emailData, error: rpcError } = await sb
        .schema("crm")
        .rpc("resolve_login_email", { p_user_code: code });
      if (rpcError || !emailData || typeof emailData !== "string") {
        setError(GENERIC_ERROR);
        setSubmitting(false);
        return;
      }
      const email = emailData;
      // 2. Sign in with the resolved email + given password.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: pwd,
      });
      if (signInError) {
        setError(GENERIC_ERROR);
        setSubmitting(false);
        return;
      }
      setAuthenticated();
      // Auto-select operator based on the signed-in email's profile.
      try {
        const sbAuthed = supabase as unknown as {
          schema: (s: string) => {
            from: (t: string) => {
              select: (cols: string) => {
                eq: (
                  col: string,
                  val: unknown,
                ) => { maybeSingle: () => Promise<{ data: unknown }> };
              };
            };
          };
        };
        const { data: prof } = await sbAuthed
          .schema("crm")
          .from("profiles")
          .select("id,full_name,email,user_code")
          .eq("email", email)
          .maybeSingle();
        if (prof && typeof prof === "object" && (prof as { id?: string }).id) {
          const p = prof as {
            id: string;
            full_name: string | null;
            email: string | null;
            user_code: string | null;
          };
          setStoredOperator(p);
        }
      } catch {
        /* ignore — operator picker will prompt */
      }
      queryClient.removeQueries({ queryKey: ["crm", "current_roles"] });
      await queryClient.invalidateQueries({ queryKey: ["crm"] });
      setAuthed(true);
      setPassword("");
      setSubmitting(false);
    } catch {
      setError(GENERIC_ERROR);
      setSubmitting(false);
    }
  };

  // Public routes bypass the gate entirely (e.g. /reset-password).
  if (PUBLIC_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  if (!hydrated) {
    return <div className="flex min-h-screen items-center justify-center bg-background" />;
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">TIVO CRM</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Pieslēdzies ar saviem iniciāļiem un paroli
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="user_code">Iniciāļi / ID</Label>
              <Input
                id="user_code"
                autoComplete="username"
                autoFocus
                value={userCode}
                maxLength={10}
                onChange={(e) => {
                  setUserCode(e.target.value.toUpperCase());
                  if (error) setError(null);
                }}
                className="font-mono uppercase"
                placeholder="GT"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Parole</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
              />
            </div>
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Pieslēdzas…" : "Ielogoties"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}

export function LogoutButton() {
  const handleLogout = () => {
    clearAuth();
    void supabase.auth.signOut().catch(() => {});
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };
  return (
    <button
      onClick={handleLogout}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      title={`Sesija beidzas pēc ${Math.round(INACTIVITY_LIMIT_MS / 60000)} min neaktivitātes`}
    >
      Iziet
    </button>
  );
}
