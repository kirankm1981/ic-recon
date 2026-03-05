import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Settings2,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Loader2,
} from "lucide-react";
import type { Rule } from "@shared/schema";

const RULE_TYPES = [
  { value: "exact_match", label: "Exact Match" },
  { value: "date_tolerance", label: "Date Tolerance" },
  { value: "reference_match", label: "Reference Token Match" },
  { value: "narration_match", label: "Narration Fuzzy Match" },
  { value: "one_to_many", label: "One-to-Many Aggregation" },
  { value: "many_to_one", label: "Many-to-One Aggregation" },
  { value: "amount_tolerance", label: "Amount Tolerance" },
];

function RuleForm({
  rule,
  onSubmit,
  isPending,
  onClose,
}: {
  rule?: Rule;
  onSubmit: (data: any) => void;
  isPending: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(rule?.name || "");
  const [ruleType, setRuleType] = useState(rule?.ruleType || "exact_match");
  const [priority, setPriority] = useState(rule?.priority?.toString() || "1");
  const [threshold, setThreshold] = useState(rule?.threshold?.toString() || "");
  const [active, setActive] = useState(rule?.active ?? true);
  const [description, setDescription] = useState(rule?.description || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      ruleType,
      priority: parseInt(priority),
      threshold: threshold ? parseFloat(threshold) : null,
      active,
      description: description || null,
    });
  };

  const needsThreshold = ["date_tolerance", "narration_match", "amount_tolerance"].includes(ruleType);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Rule Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          data-testid="input-rule-name"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ruleType">Rule Type</Label>
          <Select value={ruleType} onValueChange={setRuleType}>
            <SelectTrigger data-testid="select-rule-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_TYPES.map((rt) => (
                <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Input
            id="priority"
            type="number"
            min="1"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            required
            data-testid="input-priority"
          />
        </div>
      </div>
      {needsThreshold && (
        <div className="space-y-2">
          <Label htmlFor="threshold">
            Threshold
            {ruleType === "date_tolerance" && " (days)"}
            {ruleType === "narration_match" && " (similarity %)"}
            {ruleType === "amount_tolerance" && " (% difference)"}
          </Label>
          <Input
            id="threshold"
            type="number"
            step="0.1"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            data-testid="input-threshold"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          data-testid="input-description"
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={setActive} data-testid="switch-active" />
          <Label>Active</Label>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} data-testid="button-save-rule">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {rule ? "Update" : "Create"} Rule
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function RuleConfig() {
  const { toast } = useToast();
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: rules, isLoading } = useQuery<Rule[]>({
    queryKey: ["/api/rules"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/rules", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule Created" });
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/rules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule Updated" });
      setEditingRule(null);
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/rules/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Rule Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleActive = (rule: Rule) => {
    updateMutation.mutate({ id: rule.id, data: { active: !rule.active } });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Rule Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure and manage reconciliation matching rules
          </p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-rule">
              <Plus className="w-4 h-4 mr-2" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Rule</DialogTitle>
            </DialogHeader>
            <RuleForm
              onSubmit={(data) => createMutation.mutate(data)}
              isPending={createMutation.isPending}
              onClose={() => setShowCreate(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !rules || rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <Settings2 className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-1">No Rules Configured</h3>
            <p className="text-sm text-muted-foreground">Add reconciliation rules to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="text-muted-foreground">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{rule.priority}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold">{rule.name}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {RULE_TYPES.find((rt) => rt.value === rule.ruleType)?.label || rule.ruleType}
                      </Badge>
                      {rule.threshold !== null && (
                        <Badge variant="secondary" className="text-xs">
                          Threshold: {rule.threshold}
                        </Badge>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{rule.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={rule.active ?? false}
                      onCheckedChange={() => toggleActive(rule)}
                      data-testid={`switch-rule-${rule.id}`}
                    />
                    <Dialog
                      open={editingRule?.id === rule.id}
                      onOpenChange={(open) => !open && setEditingRule(null)}
                    >
                      <DialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingRule(rule)}
                          data-testid={`button-edit-rule-${rule.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Rule</DialogTitle>
                        </DialogHeader>
                        <RuleForm
                          rule={rule}
                          onSubmit={(data) => updateMutation.mutate({ id: rule.id, data })}
                          isPending={updateMutation.isPending}
                          onClose={() => setEditingRule(null)}
                        />
                      </DialogContent>
                    </Dialog>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(rule.id)}
                      data-testid={`button-delete-rule-${rule.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
