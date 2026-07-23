"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Keyboard-first queue navigation: j / ↓ = next seller, k / ↑ = previous. Ignored while typing in a
// field so it never fights the log/status forms.
export function WorkspaceKeys({ prevHref, nextHref }: { prevHref: string; nextHref: string }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        router.push(nextHref);
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        router.push(prevHref);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevHref, nextHref, router]);
  return null;
}
