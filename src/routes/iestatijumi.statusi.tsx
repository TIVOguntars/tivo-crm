import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/iestatijumi/statusi")({
  component: () => <PlaceholderPage title="Statusi" />,
});
