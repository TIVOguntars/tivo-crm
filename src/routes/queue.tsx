import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/queue")({
  beforeLoad: () => {
    throw redirect({ to: "/uzdevumi" });
  },
});