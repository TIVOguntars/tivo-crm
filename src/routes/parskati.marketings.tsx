import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/parskati/marketings")({
  component: () => <PlaceholderPage title="Mārketinga pārskats" />,
});
