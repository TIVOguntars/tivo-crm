import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase auto-processes the recovery hash on load; we just check
    // whether a session exists after that.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        void supabase.auth.getUser().then(({ data }) => {
          setHasRecoverySession(!!data.user);
          setReady(true);
        });
      }
    });
    void supabase.auth.getUser().then(({ data }) => {
      setHasRecoverySession(!!data.user);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Parolei jābūt vismaz 8 simbolus garai");
      return;
    }
    if (password !== confirm) {
      setError("Paroles nesakrīt");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: e2 } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (e2) {
      setError(e2.message || "Neizdevās nomainīt paroli");
      return;
    }
    toast.success("Parole nomainīta");
    await supabase.auth.signOut().catch(() => {});
    void navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Mainīt paroli
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Ievadi jauno paroli, ko izmantosi nākamajai pieslēgšanai
          </p>
        </div>
        {!ready ? (
          <p className="text-sm text-muted-foreground">Ielādē…</p>
        ) : !hasRecoverySession ? (
          <p className="text-sm text-destructive">
            Šī saite vairs nav derīga. Lūdz administratoru nosūtīt jaunu paroles
            atiestatīšanas e-pastu.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pwd">Jaunā parole</Label>
              <Input
                id="pwd"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd2">Atkārto jauno paroli</Label>
              <Input
                id="pwd2"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
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
              {submitting ? "Saglabā…" : "Saglabāt paroli"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}