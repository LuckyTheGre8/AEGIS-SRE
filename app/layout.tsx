import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aegis SRE — Investigation workspace",
  description: "Evidence-driven incident investigation. Aegis SRE v0.2 real CreateOS smoke test.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
