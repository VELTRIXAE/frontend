import Link from "next/link";
export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" aria-label="VELTRIXAE home" className="brand-logo"><svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M7 8.5 20 32 33 8.5h-8.2L20 18l-4.8-9.5H7Z" fill="url(#v)"/><path d="m12.4 8.5 7.6 14 7.6-14h5.7L20 32 6.7 8.5h5.7Z" stroke="white" strokeOpacity=".82" strokeWidth="1.2"/><circle cx="20" cy="20" r="3.1" fill="#080713" stroke="#fff" strokeWidth="1.2"/><defs><linearGradient id="v" x1="7" y1="7" x2="31" y2="31" gradientUnits="userSpaceOnUse"><stop stopColor="#A78BFA"/><stop offset="1" stopColor="#845AE8"/></linearGradient></defs></svg>{!compact && <span>VELTRIXAE</span>}</Link>;
}
