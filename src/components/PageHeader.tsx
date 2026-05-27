interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

/**
 * Page title + subtitle are rendered globally in the TopNav header.
 * This component now only renders optional action buttons (children),
 * so individual pages do not duplicate the title/subtitle in the body.
 * Title/description props are kept for backwards compatibility but
 * intentionally not rendered.
 */
export function PageHeader({ title: _title, description: _description, children }: PageHeaderProps) {
  if (!children) return null;
  return (
    <div className="mb-4 flex items-center justify-end gap-2">
      {children}
    </div>
  );
}