import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/analitika")({
  component: () => <PlaceholderPage title="Analītika" />,
});
