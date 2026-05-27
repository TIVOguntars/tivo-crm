import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/iestatijumi/workflows")({
  component: () => <PlaceholderPage title="Workflows" />,
});
