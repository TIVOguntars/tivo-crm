import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/iestatijumi/integracijas")({
  component: () => <PlaceholderPage title="Integrācijas" />,
});
