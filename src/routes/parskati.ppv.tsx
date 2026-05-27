import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/parskati/ppv")({
  component: () => <PlaceholderPage title="PPV pārskats" />,
});
