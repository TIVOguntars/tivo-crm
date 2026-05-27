import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/iestatijumi/validacijas")({
  component: () => <PlaceholderPage title="Validācijas" />,
});
