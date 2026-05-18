import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/darba-rinda")({
  beforeLoad: () => {
    throw redirect({ to: "/queue" });
  },
});
