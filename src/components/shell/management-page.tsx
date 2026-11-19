import type { ReactNode } from "react";

export function ManagementPage({ title, description, children }: {
  title: string; description: string; children: ReactNode;
}) {
  return <section className="module-page management-page" aria-label={title}>
    <header className="page-heading"><h1>{title}</h1><p>{description}</p></header>
    {children}
  </section>;
}
