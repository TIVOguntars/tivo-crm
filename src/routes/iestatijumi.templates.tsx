import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/iestatijumi/templates")({
  component: () => <PlaceholderPage title="Templates" />,
});
