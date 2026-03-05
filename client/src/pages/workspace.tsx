import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  GitCompare,
  Loader2,
  FileSpreadsheet,
  ArrowLeftRight,
  Search,
  RotateCcw,
  Link2,
  X,
} from "lucide-react";
import type { Transaction } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CompanyPair {
  company: string;
  counterParty: string;
  total: number;
  matched: number;
  unmatched: number;
  totalDebit: number;
  totalCredit: number;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const num = parseFloat(dateStr);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + num);
    return epoch.toISOString().slice(0, 10);
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return dateStr;
}

function formatAmount(val: number | null): string {
  if (val === null || val === undefined) return "-";
  if (val === 0) return "0.00";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(val));
}

function StatusPill({ status }: { status: string }) {
  if (status === "matched") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" data-testid="status-matched">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        MATCHED
      </span>
    );
  }
  if (status === "probable") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" data-testid="status-probable">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        PROBABLE
      </span>
    );
  }
  if (status === "manual") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" data-testid="status-manual">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        MANUAL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" data-testid="status-unmatched">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      UNMATCHED
    </span>
  );
}

function getStatusCategory(txn: Transaction): "matched" | "probable" | "manual" | "unmatched" {
  if (txn.reconStatus === "matched") {
    const rule = txn.reconRule?.toLowerCase() || "";
    if (rule.includes("manual")) return "manual";
    if (rule.includes("fuzzy") || rule.includes("tolerance") || rule.includes("token") || rule.includes("aggregation")) {
      return "probable";
    }
    return "matched";
  }
  return "unmatched";
}

type StatusFilter = "all" | "matched" | "probable" | "unmatched";

function EntityPanel({
  entityName,
  transactions,
  searchQuery,
  isPartyA,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  selectionMode,
  statusFilter,
}: {
  entityName: string;
  transactions: Transaction[];
  searchQuery: string;
  isPartyA: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: (ids: number[], checked: boolean) => void;
  selectionMode: boolean;
  statusFilter: StatusFilter;
}) {
  const filtered = useMemo(() => {
    let result = transactions;
    if (statusFilter !== "all") {
      result = result.filter((t) => {
        const cat = getStatusCategory(t);
        if (statusFilter === "matched") return cat === "matched" || cat === "manual";
        return cat === statusFilter;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          (t.documentNo || "").toLowerCase().includes(q) ||
          (t.narration || "").toLowerCase().includes(q) ||
          formatAmount(t.debit || t.credit || t.netAmount).includes(q)
      );
    }
    return result;
  }, [transactions, searchQuery, statusFilter]);

  const unmatchedFiltered = filtered.filter((t) => t.reconStatus !== "matched");
  const recCount = filtered.filter((t) => getStatusCategory(t) === "matched").length;
  const probCount = filtered.filter((t) => getStatusCategory(t) === "probable").length;
  const manualCount = filtered.filter((t) => getStatusCategory(t) === "manual").length;
  const unrecCount = filtered.filter((t) => getStatusCategory(t) === "unmatched").length;

  const allUnmatchedIds = unmatchedFiltered.map((t) => t.id);
  const allUnmatchedSelected = allUnmatchedIds.length > 0 && allUnmatchedIds.every((id) => selectedIds.has(id));

  return (
    <div className={`flex-1 min-w-0 border rounded-lg overflow-hidden ${selectionMode ? "border-primary/50" : ""}`} data-testid={`panel-${isPartyA ? "entity-a" : "entity-b"}`}>
      <div className="bg-muted/40 px-4 py-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide truncate" data-testid={`text-entity-${isPartyA ? "a" : "b"}-name`}>
          {entityName}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 text-xs">
            <span className="font-bold text-emerald-600">{recCount}</span>
            <span className="text-muted-foreground">Rec</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs">
            <span className="font-bold text-amber-600">{probCount}</span>
            <span className="text-muted-foreground">Prob</span>
          </span>
          {manualCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs">
              <span className="font-bold text-blue-600">{manualCount}</span>
              <span className="text-muted-foreground">Man</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs">
            <span className="font-bold text-red-600">{unrecCount}</span>
            <span className="text-muted-foreground">Unrec</span>
          </span>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-320px)]">
        <table className="w-full text-sm" data-testid={`table-${isPartyA ? "party-a" : "party-b"}`}>
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b">
              {selectionMode && (
                <th className="w-10 py-2.5 px-2 text-center">
                  <Checkbox
                    checked={allUnmatchedSelected}
                    onCheckedChange={(checked) => onSelectAll(allUnmatchedIds, !!checked)}
                    data-testid={`checkbox-select-all-${isPartyA ? "a" : "b"}`}
                  />
                </th>
              )}
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Document No</th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
              <th className="text-center py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rec ID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={selectionMode ? 6 : 5} className="py-12 text-center text-sm text-muted-foreground">
                  No transactions found
                </td>
              </tr>
            ) : (
              filtered.map((txn) => {
                const amount = (txn.debit || 0) - (txn.credit || 0);
                const statusCat = getStatusCategory(txn);
                const refText = txn.documentNo || "";
                const narText = txn.narration || "";
                const displayRef = refText || narText.slice(0, 30) || "-";
                const isUnmatched = txn.reconStatus !== "matched";
                const isSelected = selectedIds.has(txn.id);

                return (
                  <tr
                    key={txn.id}
                    className={`border-b last:border-0 transition-colors ${
                      isSelected
                        ? "bg-primary/10"
                        : "hover:bg-muted/20"
                    } ${selectionMode && isUnmatched ? "cursor-pointer" : ""}`}
                    onClick={selectionMode && isUnmatched ? () => onToggleSelect(txn.id) : undefined}
                    data-testid={`row-txn-${txn.id}`}
                  >
                    {selectionMode && (
                      <td className="w-10 py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {isUnmatched ? (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => onToggleSelect(txn.id)}
                            data-testid={`checkbox-txn-${txn.id}`}
                          />
                        ) : null}
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-xs whitespace-nowrap font-mono">
                      {formatDate(txn.docDate)}
                    </td>
                    <td className="py-2.5 px-3 text-xs max-w-[180px]">
                      <div className="truncate font-medium" title={refText}>
                        {displayRef}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs font-mono font-medium whitespace-nowrap">
                      {formatAmount(txn.netAmount || amount)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <StatusPill status={statusCat} />
                    </td>
                    <td className="py-2.5 px-3 text-xs font-mono text-muted-foreground max-w-[80px] truncate" title={txn.reconId || ""}>
                      {txn.reconId || "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

export default function Workspace() {
  const { toast } = useToast();
  const [entityA, setEntityA] = useState<string>("");
  const [entityB, setEntityB] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: companyPairs, isLoading: pairsLoading } = useQuery<CompanyPair[]>({
    queryKey: ["/api/company-pairs"],
  });

  const uniqueCompanies = useMemo(() => {
    return Array.from(
      new Set(companyPairs?.flatMap((p) => [p.company, p.counterParty]) || [])
    ).filter((c) => c && c.trim()).sort();
  }, [companyPairs]);

  const hasPairSelected = entityA && entityB && entityA !== entityB;

  const queryParamsA = new URLSearchParams();
  const queryParamsB = new URLSearchParams();
  if (hasPairSelected) {
    queryParamsA.set("company", entityA);
    queryParamsA.set("counterParty", entityB);
    queryParamsB.set("company", entityB);
    queryParamsB.set("counterParty", entityA);
  }

  const partyAUrl = hasPairSelected ? `/api/transactions?${queryParamsA.toString()}` : null;
  const partyBUrl = hasPairSelected ? `/api/transactions?${queryParamsB.toString()}` : null;

  const { data: transactionsA, isLoading: loadingA } = useQuery<Transaction[]>({
    queryKey: [partyAUrl],
    enabled: !!hasPairSelected,
  });

  const { data: transactionsB, isLoading: loadingB } = useQuery<Transaction[]>({
    queryKey: [partyBUrl],
    enabled: !!hasPairSelected,
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reconcile");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Reconciliation Complete",
        description: `${data.totalMatched} transactions matched across ${data.ruleResults.length} rules`,
      });
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast({ title: "Reconciliation Failed", description: error.message, variant: "destructive" });
    },
  });

  const manualMatchMutation = useMutation({
    mutationFn: async (transactionIds: number[]) => {
      const res = await apiRequest("POST", "/api/manual-reconcile", { transactionIds });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Manual Match Complete",
        description: `${data.matched} transactions manually reconciled (ID: ${data.reconId})`,
      });
      setSelectedIds(new Set());
      setSelectionMode(false);
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast({ title: "Manual Match Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (ids: number[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleManualMatch = () => {
    if (selectedFromA.length === 0 || selectedFromB.length === 0) {
      toast({ title: "Select from both entities", description: "You must select at least one transaction from each entity grid to create a manual match", variant: "destructive" });
      return;
    }
    const ids = Array.from(selectedIds);
    manualMatchMutation.mutate(ids);
  };

  const handleCancelSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const handleReset = () => {
    setEntityA("");
    setEntityB("");
    setSearchQuery("");
    setActiveTab("grid");
    setSelectedIds(new Set());
    setSelectionMode(false);
    setStatusFilter("all");
  };

  const handleSwapEntities = () => {
    const temp = entityA;
    setEntityA(entityB);
    setEntityB(temp);
  };

  const handleExportExcel = () => {
    const allTxns = [...(transactionsA || []), ...(transactionsB || [])];
    if (allTxns.length === 0) return;
    const headers = [
      "Company", "Counter Party", "Document No", "Doc Date",
      "Debit", "Credit", "Net Amount", "Narration", "Status", "Recon ID", "Rule",
    ];
    const rows = allTxns.map((t) => [
      t.company, t.counterParty, t.documentNo || "",
      t.docDate || "", t.debit || 0, t.credit || 0, t.netAmount || 0,
      `"${(t.narration || "").replace(/"/g, '""')}"`,
      t.reconStatus, t.reconId || "", t.reconRule || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recon_${entityA}_${entityB}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const overviewPairs = useMemo(() => {
    if (!companyPairs) return [];
    if (entityA && !entityB) {
      return companyPairs.filter((p) => p.company === entityA || p.counterParty === entityA);
    }
    if (entityA && entityB) {
      return companyPairs.filter(
        (p) =>
          (p.company === entityA && p.counterParty === entityB) ||
          (p.company === entityB && p.counterParty === entityA) ||
          (p.company === entityA || p.counterParty === entityA) &&
          (p.company === entityB || p.counterParty === entityB)
      );
    }
    return companyPairs;
  }, [companyPairs, entityA, entityB]);

  const selectedFromA = transactionsA?.filter((t) => selectedIds.has(t.id)) || [];
  const selectedFromB = transactionsB?.filter((t) => selectedIds.has(t.id)) || [];
  const totalSelected = selectedIds.size;
  const selectedDebitA = selectedFromA.reduce((s, t) => s + (t.debit || 0), 0);
  const selectedCreditA = selectedFromA.reduce((s, t) => s + (t.credit || 0), 0);
  const selectedDebitB = selectedFromB.reduce((s, t) => s + (t.debit || 0), 0);
  const selectedCreditB = selectedFromB.reduce((s, t) => s + (t.credit || 0), 0);

  return (
    <div className="p-4 space-y-4 h-full flex flex-col">
      <h1 className="text-xl font-bold" data-testid="text-page-title">Reconciliation Dashboard</h1>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                Entity A (Books)
              </label>
              <Select value={entityA || "__none__"} onValueChange={(v) => setEntityA(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-full" data-testid="select-entity-a">
                  <SelectValue placeholder="Select Entity A..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select Entity A...</SelectItem>
                  {uniqueCompanies.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <button
              onClick={handleSwapEntities}
              className="mt-5 p-2 rounded-full border hover:bg-muted transition-colors"
              title="Swap entities"
              data-testid="button-swap-entities"
            >
              <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                Entity B (Counter Party)
              </label>
              <Select value={entityB || "__none__"} onValueChange={(v) => setEntityB(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-full" data-testid="select-entity-b">
                  <SelectValue placeholder="Select Entity B..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select Entity B...</SelectItem>
                  {uniqueCompanies.filter((c) => c !== entityA).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2 mt-5">
              <Button
                onClick={() => reconcileMutation.mutate()}
                disabled={reconcileMutation.isPending}
                data-testid="button-reconcile"
              >
                {reconcileMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <GitCompare className="w-4 h-4 mr-2" />
                )}
                Re-run Engine
              </Button>
              <Button variant="outline" onClick={handleReset} data-testid="button-reset">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="grid" data-testid="tab-grid">Reconciliation Grid</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {activeTab === "grid" && hasPairSelected && (
            <div className="flex items-center rounded-md border p-0.5 gap-0.5" data-testid="filter-status">
              {(["all", "matched", "probable", "unmatched"] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === f
                      ? f === "matched" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : f === "probable" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                        : f === "unmatched" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                        : "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  data-testid={`button-filter-${f}`}
                >
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          )}
          {activeTab === "grid" && hasPairSelected && !selectionMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(true)}
              data-testid="button-start-manual-match"
            >
              <Link2 className="w-4 h-4 mr-2" />
              Manual Match
            </Button>
          )}
          {activeTab === "grid" && hasPairSelected && (
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search amounts or refs..."
                className="pl-9 w-[220px] h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
          )}
          {hasPairSelected && (
            <Button variant="default" size="sm" onClick={handleExportExcel} data-testid="button-export">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
          )}
        </div>
      </div>

      {selectionMode && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
          <div className="flex items-center gap-4 text-sm">
            <Link2 className="w-4 h-4 text-primary" />
            <span className="font-semibold">Manual Match Mode</span>
            <span className="text-muted-foreground">
              Select transactions from both grids to manually reconcile
            </span>
          </div>
          <div className="flex items-center gap-3">
            {totalSelected > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <span className="font-medium">{totalSelected} selected</span>
                {selectedFromA.length > 0 && (
                  <Badge variant="outline">
                    {entityA.slice(0, 15)}: {selectedFromA.length}
                  </Badge>
                )}
                {selectedFromB.length > 0 && (
                  <Badge variant="outline">
                    {entityB.slice(0, 15)}: {selectedFromB.length}
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  Dr: {formatAmount(selectedDebitA + selectedDebitB)} | Cr: {formatAmount(selectedCreditA + selectedCreditB)}
                </span>
              </div>
            )}
            <Button
              size="sm"
              onClick={handleManualMatch}
              disabled={selectedFromA.length === 0 || selectedFromB.length === 0 || manualMatchMutation.isPending}
              data-testid="button-confirm-manual-match"
            >
              {manualMatchMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 mr-2" />
              )}
              Match Selected ({totalSelected})
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancelSelection} data-testid="button-cancel-manual-match">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {activeTab === "overview" && (
        <Card className="flex-1">
          <CardContent className="p-0">
            {pairsLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : overviewPairs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <ArrowLeftRight className="w-10 h-10 text-muted-foreground mb-3" />
                <h3 className="text-base font-semibold mb-1" data-testid="text-empty-grid">No Company Pairs</h3>
                <p className="text-sm text-muted-foreground">Upload transactions to see intercompany relationships</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-company-pairs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entity A</th>
                      <th className="text-center py-3 px-2"></th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entity B</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-emerald-600 uppercase tracking-wider">Matched</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-red-600 uppercase tracking-wider">Unmatched</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Debit</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewPairs.map((pair) => (
                      <tr
                        key={`${pair.company}-${pair.counterParty}`}
                        className="border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => { setEntityA(pair.company); setEntityB(pair.counterParty); setActiveTab("grid"); }}
                        data-testid={`row-pair-${pair.company}-${pair.counterParty}`}
                      >
                        <td className="py-3 px-4 font-medium text-sm">{pair.company || "(blank)"}</td>
                        <td className="py-3 px-2 text-center"><ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground inline-block" /></td>
                        <td className="py-3 px-4 font-medium text-sm">{pair.counterParty || "(blank)"}</td>
                        <td className="py-3 px-4 text-center"><Badge variant="outline">{pair.total}</Badge></td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{pair.matched}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{pair.unmatched}</span>
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-mono">{formatAmount(pair.totalDebit)}</td>
                        <td className="py-3 px-4 text-right text-xs font-mono">{formatAmount(pair.totalCredit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "grid" && (
        <>
          {!hasPairSelected ? (
            <Card className="flex-1">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ArrowLeftRight className="w-10 h-10 text-muted-foreground mb-3" />
                <h3 className="text-base font-semibold mb-1">Select Entities</h3>
                <p className="text-sm text-muted-foreground">Choose Entity A and Entity B above to view the reconciliation grid</p>
              </CardContent>
            </Card>
          ) : loadingA || loadingB ? (
            <div className="flex gap-4 flex-1">
              {[1, 2].map((i) => (
                <div key={i} className="flex-1 border rounded-lg p-6 space-y-3">
                  {[1, 2, 3, 4, 5].map((j) => <Skeleton key={j} className="h-10 w-full" />)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-4 flex-1 min-h-0">
              <EntityPanel
                entityName={entityA}
                transactions={transactionsA || []}
                searchQuery={searchQuery}
                isPartyA={true}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                selectionMode={selectionMode}
                statusFilter={statusFilter}
              />
              <EntityPanel
                entityName={entityB}
                transactions={transactionsB || []}
                searchQuery={searchQuery}
                isPartyA={false}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                selectionMode={selectionMode}
                statusFilter={statusFilter}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
