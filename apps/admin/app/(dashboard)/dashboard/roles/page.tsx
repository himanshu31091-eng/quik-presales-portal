import { Shield, Plus, Lock, Info } from "lucide-react";
import Badge from "@/components/ui/badge";
import RolesPageClient from "./roles-client";

export default function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ appId?: string; userId?: string }>;
}) {
  return <RolesPageClient searchParamsPromise={searchParams} />;
}
