import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/sis-darba-rinda")({
  component: () => <PlaceholderPage title="SIS darba rinda" />,
});
