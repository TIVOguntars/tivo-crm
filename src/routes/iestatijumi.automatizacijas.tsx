import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/iestatijumi/automatizacijas")({
  component: () => <PlaceholderPage title="Automatizācijas" />,
});
