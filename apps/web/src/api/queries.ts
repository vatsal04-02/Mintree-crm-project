/** TanStack Query hooks, named like the Orval hooks that will replace them. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Decision, decideLot, fetchLot, fetchQcHome, fetchStock, type StockQuery } from "./client";

export const keys = {
  qcHome: ["qc", "home"] as const,
  stock: (q: StockQuery) => ["stock", q] as const,
  lot: (lotNo: string) => ["lot", lotNo] as const,
};

export function useQcHome() {
  return useQuery({ queryKey: keys.qcHome, queryFn: fetchQcHome });
}

export function useStock(q: StockQuery) {
  return useQuery({ queryKey: keys.stock(q), queryFn: () => fetchStock(q), placeholderData: keepPreviousData });
}

export function useLot(lotNo: string | undefined) {
  return useQuery({
    queryKey: keys.lot(lotNo ?? ""),
    queryFn: () => fetchLot(lotNo ?? ""),
    enabled: Boolean(lotNo),
  });
}

/** Quality actions wait for the server: no optimistic update (brief §4). */
export function useDecideLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lotNo, decision }: { lotNo: string; decision: Decision }) => decideLot(lotNo, decision),
    onSuccess: (_lot, { lotNo }) => {
      void qc.invalidateQueries({ queryKey: keys.qcHome });
      void qc.invalidateQueries({ queryKey: ["stock"] });
      void qc.invalidateQueries({ queryKey: keys.lot(lotNo) });
    },
  });
}
