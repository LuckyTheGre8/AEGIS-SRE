import type { ReactNode } from "react";

export function Panel({ title, icon, aside, children, className = "" }: {
  title: string; icon: ReactNode; aside?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={`panel ${className}`} aria-label={title}>
    <div className="panel-heading"><h2>{icon}{title}</h2>{aside}</div>
    {children}
  </section>;
}
