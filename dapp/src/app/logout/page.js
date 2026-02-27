"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    localStorage.removeItem("id");

    // Clear HttpOnly auth cookie via server
    fetch("/api/auth/login", { method: "DELETE" })
      .catch(() => {})
      .finally(() => router.push("/"));
  }, [router]);

  return null;
}
