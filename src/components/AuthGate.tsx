import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  checkPassword,
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

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const queryClient = useQueryClient();
  // Always start unauthenticated on the server / first paint to avoid
  // hydration mismatches and to ensure no analytics renders before check.
  const [authed, setAuthed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function ensureSupabaseSession(): Promise<boolean> {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const { data: userData, error } = await supabase.auth.getUser();
        return !error && !!userData.user;
      }
      const { data: signed, error } = await supabase.auth.signInAnonymously();
      if (error || !signed.session) {
        console.error("[auth] anonymous sign-in failed", error?.message);
        return false;
      }
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) return false;
      return true;
    } catch (e) {
      console.error("[auth] ensureSupabaseSession", e);
      return false;
    }
  }

  // Initial session check after mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const valid = isSessionValid();
      if (!valid) {
        clearAuth();
        if (!cancelled) setHydrated(true);
        return;
      }
      const ok = await ensureSupabaseSession();
      if (cancelled) return;
      if (ok) {
        setAuthed(true);
      } else {
        clearAuth();
        setError("Neizdevās atjaunot sesiju. Pieslēdzies vēlreiz.");
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    setAuthed(false);
    setPassword("");
    setError(null);
    void supabase.auth.signOut().catch(() => {});
  }, []);

  // Activity tracking + inactivity timer (only when authed)
  useEffect(() => {
    if (!authed) return;

    const onActivity = () => {
      touchActivity();
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "click",
      "keydown",
      "scroll",
      "touchstart",
      "touchmove",
    ];
    events.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true }),
    );

    // Periodically check inactivity
    timerRef.current = setInterval(() => {
      if (!isSessionValid()) {
        handleLogout();
      }
    }, 30_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [authed, handleLogout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkPassword(password)) {
      setError("Nepareiza parole");
      return;
    }
    setSubmitting(true);
    const ok = await ensureSupabaseSession();
    if (!ok) {
      setSubmitting(false);
      setError("Neizdevās izveidot sesiju. Mēģini vēlreiz.");
      return;
    }
    setAuthenticated();
    await queryClient.invalidateQueries({ queryKey: ["crm"] });
    setAuthed(true);
    setError(null);
    setPassword("");
    setSubmitting(false);
  };

  // Render nothing meaningful until client hydration to keep SSR output
  // free of analytics content.
  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" />
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              TIVO / Analytics
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Ievadiet paroli, lai piekļūtu analītikai
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="password">Parole</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
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
    // Hard reload to fully reset auth state and clear any cached queries.
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