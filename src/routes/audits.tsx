import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/audits")({
  component: () => <PlaceholderPage title="Audits" />,
});
