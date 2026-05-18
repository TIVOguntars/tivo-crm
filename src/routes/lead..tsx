// Legacy /lead/ route — redirects to canonical lead list (/leadi).
// Kept as a shim for any external bookmarks. Do not link from primary nav.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/lead/")({
  beforeLoad: () => {
    throw redirect({ to: "/leadi" });
  },
});
