"use client";

import { useState, useEffect } from "react";

export default function Header() {
  const [open, setOpen] = useState(false);

  // Close menu on Escape, lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const navLinks = [
    { href: "/app", label: "Transcribe" },
    { href: "/viewer", label: "Viewer" },
    { href: "/pricing", label: "Pricing" },
  ];

  return (
    <header className="border-b border-[#27272a] px-4 sm:px-6 py-4 relative z-30">
      <div className="mx-auto flex max-w-5xl items-center gap-4">
        <a href="/" className="flex items-center gap-2 group shrink-0">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-xs font-bold text-white">
            N
          </div>
          <span className="text-lg font-bold text-white group-hover:text-violet-300 transition-colors">
            Notara
          </span>
        </a>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden md:flex items-center gap-6 ml-6">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-[#a1a1aa] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] rounded px-1"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* Right actions (always visible on desktop, compact on mobile) */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <a
            href="/signin"
            className="hidden sm:inline-block text-sm text-[#a1a1aa] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] rounded px-1"
          >
            Sign in
          </a>
          <a
            href="/pricing"
            className="hidden sm:inline-block rounded-md bg-gradient-to-r from-violet-600 to-indigo-700 px-3 sm:px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            Get Pro
          </a>

          {/* Hamburger — visible <md */}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            {open ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile slide-out menu */}
      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="md:hidden fixed inset-0 bg-black/60 z-40 cursor-default"
          />
          {/* Panel */}
          <div className="md:hidden fixed top-0 right-0 bottom-0 w-72 max-w-[85vw] bg-[#0c0c0e] border-l border-[#27272a] z-50 px-6 py-6 flex flex-col gap-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white">Menu</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-md text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-3 py-3 rounded-md text-base text-white hover:bg-[#18181b] transition-colors"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-4 pt-4 border-t border-[#27272a] flex flex-col gap-2">
              <a
                href="/signin"
                onClick={() => setOpen(false)}
                className="px-3 py-3 rounded-md text-base text-white hover:bg-[#18181b] transition-colors"
              >
                Sign in
              </a>
              <a
                href="/pricing"
                onClick={() => setOpen(false)}
                className="text-center rounded-md bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-3 text-base font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Get Pro
              </a>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
