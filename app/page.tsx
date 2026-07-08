import { redirect } from "next/navigation";

import { readSessionToken } from "@/lib/auth";

export default function HomePage() {
  redirect(readSessionToken() ? "/dashboard" : "/login");
}
