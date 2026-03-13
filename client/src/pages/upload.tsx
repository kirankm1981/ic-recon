import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Upload as UploadIcon,
  FileUp,
  Check,
  Loader2,
  FileText,
  Clock,
  Hash,
  Columns,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import type { UploadBatch } from "@shared/schema";

interface ColumnMapping {
  company: string;
  counterParty: string;
  documentNo: string;
  docDate: string;
  debit: string;
  credit: string;
  netAmount: string;
  narration: string;
  icGl: string;
  businessUnit: string;
  accountHead: string;
  subAccountHead: string;
}

const FIELD_LABELS: Record<keyof ColumnMapping, { label: string; required: boolean }> = {
  company: { label: "Company", required: true },
  counterParty: { label: "Counter Party", required: true },
  documentNo: { label: "Document No", required: false },
  docDate: { label: "Date", required: false },
  debit: { label: "Debit", required: false },
  credit: { label: "Credit", required: false },
  netAmount: { label: "Net Amount", required: false },
  narration: { label: "Narration", required: false },
  icGl: { label: "IC GL", required: false },
  businessUnit: { label: "Business Unit", required: false },
  accountHead: { label: "Account Head", required: false },
  subAccountHead: { label: "Sub Account Head", required: false },
};

function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};

  const patterns: Record<keyof ColumnMapping, RegExp[]> = {
    company: [/^company$/i, /^company\s*name$/i, /^entity$/i, /^entity\s*name$/i, /^from\s*company$/i, /^from\s*entity$/i, /^ic\s*company$/i, /^comp\s*name$/i],
    counterParty: [/^counter\s*party$/i, /^counterparty$/i, /^counter\s*party\s*name$/i, /^to\s*company$/i, /^to\s*entity$/i, /^ic\s*partner$/i, /^partner\s*company$/i, /^other\s*entity$/i],
    documentNo: [/^doc(ument)?\s*no$/i, /^document\s*number$/i, /^invoice\s*no$/i, /^voucher\s*no$/i, /^ref(erence)?\s*no$/i, /^gl\s*doc\s*no$/i],
    docDate: [/^doc(ument)?\s*date$/i, /^date$/i, /^transaction\s*date$/i, /^txn\s*date$/i, /^posting\s*date$/i, /^invoice\s*date$/i, /^voucher\s*date$/i],
    debit: [/^debit$/i, /^dr$/i, /^dr\s*amount$/i, /^debit\s*amount$/i],
    credit: [/^credit$/i, /^cr$/i, /^cr\s*amount$/i, /^credit\s*amount$/i],
    netAmount: [/^net\s*amount$/i, /^amount$/i, /^balance$/i, /^net$/i],
    narration: [/^narration$/i, /^description$/i, /^remarks$/i, /^particulars$/i, /^details$/i, /^memo$/i, /^notes$/i],
    icGl: [/^ic\s*gl$/i, /^ic\s*account$/i, /^ic\s*ledger$/i, /^intercompany\s*gl$/i],
    businessUnit: [/^business\s*unit$/i, /^bu$/i],
    accountHead: [/^account\s*head$/i, /^account$/i, /^gl\s*account$/i, /^gl\s*head$/i],
    subAccountHead: [/^sub\s*account\s*head$/i, /^sub\s*account$/i],
  };

  for (const [field, regexList] of Object.entries(patterns)) {
    for (const header of headers) {
      const trimmed = header.trim();
      for (const regex of regexList) {
        if (regex.test(trimmed)) {
          mapping[field as keyof ColumnMapping] = header;
          break;
        }
      }
      if (mapping[field as keyof ColumnMapping]) break;
    }
  }

  return mapping;
}

function isExcelFile(file: File | null): boolean {
  if (!file) return false;
  const ext = file.name.toLowerCase().split(".").pop();
  return ext === "xlsx" || ext === "xls";
}

export default function UploadPage() {
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [step, setStep] = useState<"select" | "sheet" | "mapping" | "done">("select");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Partial<ColumnMapping>>({});

  const { data: batches, isLoading: batchesLoading } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload-batches"],
  });

  const sheetNamesMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/sheet-names", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to read sheets");
      }
      return res.json() as Promise<{ sheetNames: string[] }>;
    },
    onSuccess: (data) => {
      if (data.sheetNames.length > 1) {
        setSheetNames(data.sheetNames);
        setSelectedSheet(data.sheetNames[0]);
        setStep("sheet");
      } else {
        previewWithSheet(data.sheetNames[0] || "");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Could not read file",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async ({ file, sheetName }: { file: File; sheetName?: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (sheetName) formData.append("sheetName", sheetName);
      const res = await fetch("/api/upload/preview-headers", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Preview failed");
      }
      return res.json() as Promise<{ headers: string[]; sampleRows: Record<string, string>[] }>;
    },
    onSuccess: (data) => {
      setCsvHeaders(data.headers);
      setSampleRows(data.sampleRows);
      const detected = autoDetectMapping(data.headers);
      setColumnMapping(detected);
      setStep("mapping");
    },
    onError: (error: Error) => {
      toast({
        title: "Could not read file",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const previewWithSheet = (sheetName: string) => {
    if (!selectedFile) return;
    setSelectedSheet(sheetName);
    previewMutation.mutate({ file: selectedFile, sheetName });
  };

  const uploadMutation = useMutation({
    mutationFn: async ({ file, mapping, sheetName }: { file: File; mapping: Partial<ColumnMapping>; sheetName?: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("columnMapping", JSON.stringify(mapping));
      if (sheetName) formData.append("sheetName", sheetName);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || "Upload failed");
      }
      return body;
    },
    onSuccess: (data) => {
      const warnings = data.warnings?.length > 0 ? ` (${data.warnings.join(", ")})` : "";
      toast({
        title: "Upload Successful",
        description: `${data.totalRecords} transactions imported from ${data.fileName}${warnings}`,
      });
      setSelectedFile(null);
      setStep("select");
      setSheetNames([]);
      setSelectedSheet("");
      setCsvHeaders([]);
      setSampleRows([]);
      setColumnMapping({});
      queryClient.invalidateQueries({ queryKey: ["/api/upload-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/counterparties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company-pairs"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/transactions/clear", { method: "POST" });
      if (!res.ok) throw new Error("Failed to clear");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Data Cleared", description: "All transaction data has been removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/upload-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/counterparties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company-pairs"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear data", variant: "destructive" });
    },
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const handleFileChosen = (file: File) => {
    setSelectedFile(file);
    if (isExcelFile(file)) {
      sheetNamesMutation.mutate(file);
    } else {
      previewMutation.mutate({ file });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChosen(file);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileChosen(file);
  }, []);

  const handleUpload = () => {
    if (!selectedFile) return;
    if (!columnMapping.company || !columnMapping.counterParty) {
      toast({
        title: "Mapping Required",
        description: "Please map at least Company and Counter Party columns",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate({
      file: selectedFile,
      mapping: columnMapping,
      sheetName: selectedSheet || undefined,
    });
  };

  const updateMapping = (field: keyof ColumnMapping, value: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [field]: value === "__none__" ? undefined : value,
    }));
  };

  const missingRequired = !columnMapping.company || !columnMapping.counterParty;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Upload Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Import intercompany transaction files in CSV or Excel (.xlsx) format
          </p>
        </div>
        {batches && batches.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("This will delete all uploaded transactions. Continue?")) {
                clearMutation.mutate();
              }
            }}
            disabled={clearMutation.isPending}
            data-testid="button-clear-data"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All Data
          </Button>
        )}
      </div>

      {step === "select" && (
        <Card>
          <CardContent className="p-6">
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                dragActive ? "border-primary bg-primary/5" : "border-border"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              data-testid="dropzone-upload"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <UploadIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-base font-medium">Drop your CSV or Excel file here</p>
                  <p className="text-sm text-muted-foreground mt-1">Supports .csv and .xlsx formats</p>
                </div>
                <label>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleFileSelect}
                    data-testid="input-file"
                  />
                  <Button variant="secondary" asChild>
                    <span>
                      <FileUp className="w-4 h-4 mr-2" />
                      Browse Files
                    </span>
                  </Button>
                </label>
              </div>
            </div>
            {(previewMutation.isPending || sheetNamesMutation.isPending) && (
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {sheetNamesMutation.isPending ? "Detecting sheets..." : "Reading file headers..."}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "sheet" && selectedFile && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Select Sheet
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span data-testid="text-sheet-file">{selectedFile.name}</span>
                  <Badge variant="outline">{sheetNames.length} sheets</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep("select");
                    setSelectedFile(null);
                    setSheetNames([]);
                    setSelectedSheet("");
                  }}
                  data-testid="button-change-file-sheet"
                >
                  Change File
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This Excel file contains multiple sheets. Select which sheet contains your transaction data.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {sheetNames.map((name, idx) => (
                <button
                  key={name}
                  onClick={() => setSelectedSheet(name)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                    selectedSheet === name
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/50"
                  }`}
                  data-testid={`button-sheet-${idx}`}
                >
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold ${
                    selectedSheet === name
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {idx + 1}
                  </div>
                  <span className="text-sm font-medium truncate">{name}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setStep("select");
                  setSelectedFile(null);
                  setSheetNames([]);
                  setSelectedSheet("");
                }}
                data-testid="button-cancel-sheet"
              >
                Cancel
              </Button>
              <Button
                onClick={() => previewWithSheet(selectedSheet)}
                disabled={!selectedSheet || previewMutation.isPending}
                data-testid="button-confirm-sheet"
              >
                {previewMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Reading...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Use This Sheet
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "mapping" && selectedFile && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Columns className="w-4 h-4" />
                Map Columns
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span data-testid="text-selected-file">{selectedFile.name}</span>
                  {selectedSheet && (
                    <Badge variant="secondary" data-testid="text-selected-sheet">{selectedSheet}</Badge>
                  )}
                  <Badge variant="outline">{csvHeaders.length} columns</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep("select");
                    setSelectedFile(null);
                    setSheetNames([]);
                    setSelectedSheet("");
                    setCsvHeaders([]);
                    setSampleRows([]);
                    setColumnMapping({});
                  }}
                  data-testid="button-change-file"
                >
                  Change File
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {missingRequired && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <span>
                  Please map the <strong>Company</strong> and <strong>Counter Party</strong> columns. These are required for reconciliation.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Object.entries(FIELD_LABELS) as [keyof ColumnMapping, { label: string; required: boolean }][]).map(
                ([field, { label, required }]) => (
                  <div key={field} className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      {label}
                      {required && <span className="text-destructive">*</span>}
                    </label>
                    <Select
                      value={columnMapping[field] || "__none__"}
                      onValueChange={(val) => updateMapping(field, val)}
                    >
                      <SelectTrigger
                        className={`w-full ${
                          required && !columnMapping[field]
                            ? "border-destructive"
                            : columnMapping[field]
                            ? "border-primary"
                            : ""
                        }`}
                        data-testid={`select-mapping-${field}`}
                      >
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Not mapped --</SelectItem>
                        {csvHeaders.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {columnMapping[field] && sampleRows.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate" title={sampleRows[0][columnMapping[field]!]}>
                        Sample: {sampleRows[0][columnMapping[field]!] || "(empty)"}
                      </p>
                    )}
                  </div>
                )
              )}
            </div>

            {sampleRows.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Data Preview (first {sampleRows.length} rows)</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs" data-testid="table-csv-preview">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {csvHeaders.map((h) => (
                          <th key={h} className="text-left py-2 px-3 font-medium whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sampleRows.map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {csvHeaders.map((h) => (
                            <td key={h} className="py-1.5 px-3 max-w-[200px] truncate">
                              {row[h] || ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setStep("select");
                  setSelectedFile(null);
                }}
                data-testid="button-cancel-mapping"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploadMutation.isPending || missingRequired}
                data-testid="button-upload"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Upload & Import
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload History</CardTitle>
        </CardHeader>
        <CardContent>
          {batchesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !batches || batches.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No files uploaded yet
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                  data-testid={`row-batch-${batch.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{batch.fileName}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Hash className="w-3 h-3" />
                          {batch.totalRecords} records
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {batch.uploadedAt
                            ? new Date(batch.uploadedAt).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary">{batch.batchId.slice(0, 8)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
