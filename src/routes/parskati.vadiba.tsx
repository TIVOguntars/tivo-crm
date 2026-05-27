import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/parskati/vadiba")({
  component: () => <PlaceholderPage title="Vadības pārskats" />,
});
