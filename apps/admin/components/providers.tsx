"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { ConfirmProvider } from "@quikit/ui";
import { useState } from "react";
import { type Session } from "next-auth";

/**
 * Provider stack mirrors apps/admin: SessionProvider → QueryClientProvider →
 * ThemeProvider → ConfirmProvider. CLAUDE.md mandates this exact order.
 */
export default function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
