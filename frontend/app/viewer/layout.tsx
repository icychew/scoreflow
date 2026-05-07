import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notara — Sheet Music Viewer & ABC Notation Editor",
  description:
    "Play with ABC notation in your browser. Preview demo songs or write your own — Notara renders live sheet music with Play, Pause, and Stop controls.",
};

export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
