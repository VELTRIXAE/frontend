import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; children: ReactNode };
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) { return <button className={`button button-${variant} ${className}`} {...props} />; }
export function ButtonLink({ href, variant = "primary", children }: { href: string; variant?: "primary" | "secondary" | "ghost"; children: ReactNode }) { return <Link href={href} className={`button button-${variant}`}>{children}</Link>; }
