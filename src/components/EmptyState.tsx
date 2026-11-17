// One calm empty state for screens with nothing to show yet: a title, one sentence, and at most one action.
import Link from "next/link";

export default function EmptyState({ title, body, href, action, className = "" }: { title: string; body: string; href?: string; action?: string; className?: string }) {
  return <section className={`card flex flex-col items-start gap-2 ${className}`} role="status">
    <h2 className="text-lg font-bold">{title}</h2>
    <p className="text-sm text-muted">{body}</p>
    {href && action && <Link className="btn-primary mt-1" href={href}>{action}</Link>}
  </section>;
}
