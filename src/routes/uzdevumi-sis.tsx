import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/uzdevumi-sis")({
  component: () => <PlaceholderPage title="Uzdevumi SIS" />,
});