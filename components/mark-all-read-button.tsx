"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { markNotificationsRead } from "@/app/(workspace)/notifications/actions";

/** Marks all notifications read, then refreshes so the bell badge updates. */
export function MarkAllReadButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markNotificationsRead();
          router.refresh();
        })
      }
    >
      {pending ? "Marking…" : "Mark all as read"}
    </button>
  );
}
