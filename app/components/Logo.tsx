import { Leaf } from "lucide-react";
import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link className={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="Scan My Meal home">
    <span className="brand-mark"><Leaf size={19} strokeWidth={2.4} /></span>
    <span><strong>Scan My Meal</strong>{!compact && <small>by Dr. Ashu</small>}</span>
  </Link>;
}
