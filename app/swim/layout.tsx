import type { ReactNode } from "react";
import AuthGate from "../auth-gate";
import { SwimShell } from "./swim-shell";
import "./swim.css";

export const metadata = { title: "VOLT Swim" };

export default function SwimLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <SwimShell>{children}</SwimShell>
    </AuthGate>
  );
}
