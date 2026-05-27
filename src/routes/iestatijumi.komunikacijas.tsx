import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/iestatijumi/komunikacijas")({
  component: () => <PlaceholderPage title="Komunikāciju iestatījumi" />,
});
