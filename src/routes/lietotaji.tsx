import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/lietotaji")({
  component: () => <PlaceholderPage title="Lietotāji un lomas" />,
});
