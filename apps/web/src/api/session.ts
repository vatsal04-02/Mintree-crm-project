import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FrappeError, get, setCsrfToken } from "./frappe";

export type PType = "read" | "create" | "write" | "submit" | "cancel";

export type Boot = {
  user: string;
  full_name: string;
  roles: string[];
  csrf_token: string;
  company: string | null;
  currency: string | null;
  doctypes: Record<string, Record<PType, boolean>>;
  reports: string[];
  desk_url: string;
};

export const BOOT_KEY = ["boot"] as const;

/** The signed-in user, from factory_ops.api.factory_os.boot; null when signed out. */
export async function fetchBoot(): Promise<Boot | null> {
  try {
    const boot = await get<Boot>("factory_ops.api.factory_os.boot");
    setCsrfToken(boot.csrf_token);
    return boot;
  } catch (e) {
    if (e instanceof FrappeError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

export function useBoot() {
  return useQuery({ queryKey: BOOT_KEY, queryFn: fetchBoot, staleTime: 5 * 60_000 });
}

/** Only for use under the signed-in layout. */
export function useSession(): Boot {
  const qc = useQueryClient();
  const boot = qc.getQueryData<Boot | null>(BOOT_KEY);
  if (!boot) throw new Error("useSession used outside the signed-in layout");
  return boot;
}

/** What the server's role permissions allow; mirrors them for display only. */
export function can(boot: Boot, doctype: string, ptype: PType = "read"): boolean {
  return boot.doctypes[doctype]?.[ptype] ?? false;
}

export function hasReport(boot: Boot, report: string): boolean {
  return boot.reports.includes(report);
}

export function isSampleCompany(boot: Boot): boolean {
  return (boot.company ?? "").toUpperCase().startsWith("SAMPLE");
}
