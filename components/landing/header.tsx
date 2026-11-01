"use client";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";

const links = [["Features", "#features"], ["How it works", "#how-it-works"], ["Security", "#security"], ["FAQ", "#faq"]];
export function Header() {
  const [open, setOpen] = useState(false);
  return <header className="site-header"><div className="container nav-row"><Logo/><nav className={open ? "nav-links open" : "nav-links"} aria-label="Primary navigation">{links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}<ButtonLink href="/app" variant="secondary">Connect wallet</ButtonLink></nav><button className="menu-button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button></div></header>;
}
