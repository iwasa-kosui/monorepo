import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@iwasa-kosui/ui";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/talks", label: "Talks" },
  { to: "/about", label: "About" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-xl font-bold text-primary">
            iwasa-kosui
          </Link>
          <div className="flex items-center gap-1">
            {navLinks.map((link) => (
              <Button key={link.to} variant="ghost" size="sm" asChild>
                <Link to={link.to}>{link.label}</Link>
              </Button>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} iwasa-kosui
        </div>
      </footer>
    </div>
  );
}
