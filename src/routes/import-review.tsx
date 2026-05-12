import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/import-review")({
  component: ImportReviewPage,
});

function ImportReviewPage() {
  return (
    <PagePlaceholder
      title="Importa pārskats"
      description="Prioritārā sadaļa: ienākošo importa partiju validācija, kļūdu izskatīšana un apstiprināšana."
      allowedRoles={["admin", "manager"]}
      sections={[
        { title: "Gaida apstiprinājumu", description: "Importa partijas, kuras gaida pārskatīšanu." },
        { title: "Kļūdas un brīdinājumi", description: "Rindas ar validācijas problēmām." },
        { title: "Dublikāti", description: "Iespējami sakritīgi leadi." },
        { title: "Apstiprinātie imports", description: "Pēdējie veiksmīgie imports." },
        { title: "Noraidītie", description: "Atmestās partijas un iemesli." },
        { title: "Avotu kartējums", description: "Avotu un lauku mapping konfigurācija." },
      ]}
    />
  );
}