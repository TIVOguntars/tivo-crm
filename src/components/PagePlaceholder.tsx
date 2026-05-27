import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
interface PagePlaceholderProps {
  title: string;
  description?: string;
  allowedRoles: readonly string[];
  sections?: { title: string; description?: string }[];
}

export function PagePlaceholder({
  title,
  description,
  allowedRoles,
  sections = [],
}: PagePlaceholderProps) {
  return (
    <div>
      <PageHeader title={title} description={description}>
        <div className="flex flex-wrap items-center gap-1">
          {allowedRoles.map((r) => (
            <Badge key={r} variant="secondary" className="text-xs capitalize">
              {r}
            </Badge>
          ))}
        </div>
      </PageHeader>

      {sections.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <Card key={s.title}>
              <CardHeader>
                <CardTitle className="text-base">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {s.description ?? "Sadaļa tiks pievienota."}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Šī sadaļa ir sagatavota un drīzumā tiks aizpildīta ar saturu.
          </CardContent>
        </Card>
      )}
    </div>
  );
}