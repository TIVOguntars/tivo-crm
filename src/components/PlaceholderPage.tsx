export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-3xl py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Šis skats tiks veidots nākamajos soļos.
      </p>
    </div>
  );
}