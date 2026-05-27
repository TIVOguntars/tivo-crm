import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/** Sends a password-reset email to the currently signed-in user. */
export function ChangePasswordButton() {
  const { profile } = useCurrentUser();
  const [sending, setSending] = useState(false);

  const handleClick = async () => {
    const email = profile?.email?.trim();
    if (!email) {
      // Fall back to the auth user's email.
      const { data } = await supabase.auth.getUser();
      const fallback = data.user?.email;
      if (!fallback) {
        toast.error("Nav atrasts e-pasts paroles maiņai");
        return;
      }
      await send(fallback);
      return;
    }
    await send(email);
  };

  const send = async (email: string) => {
    setSending(true);
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setSending(false);
    if (error) {
      toast.error("Neizdevās nosūtīt paroles atiestatīšanu");
      return;
    }
    toast.success("Paroles atiestatīšanas e-pasts nosūtīts");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={sending}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
      title="Nosūtīt paroles maiņas e-pastu"
    >
      {sending ? "Sūta…" : "Mainīt paroli"}
    </button>
  );
}