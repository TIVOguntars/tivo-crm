import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/manual-corrections")({
  component: ManualCorrectionsPage,
});

function ManualCorrectionsPage() {
  return (
    <PagePlaceholder
      title="Manuālās korekcijas"
      description="Datu labojumi, lauku pārrakstīšana un manuālas izmaiņas leadiem."
      allowedRoles={["admin", "manager"]}
      sections={[
        { title: "Gaida apstiprinājumu" },
        { title: "Pēdējās izmaiņas" },
        { title: "Atcelšanas vēsture" },
      ]}
    />
  );
}