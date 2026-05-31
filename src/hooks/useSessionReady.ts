import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true once a Supabase session with a valid access token exists.
 * Use to gate protected server-fn queries so they never fire before the
 * bearer-token attacher has a token to send (avoids transient 401s on load).
 */
export function useSessionReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session?.access_token) setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setReady(!!session?.access_token);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return ready;
}
