import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  CheckCircle,
  XCircle,
  TrendingUp,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface DashboardStats {
  totalTransactions: number;
  matchedTransactions: number;
  unmatchedTransactions: number;
  matchRate: number;
  totalDebit: number;
  totalCredit: number;
  companySummary: { company: string; total: number; matched: number; unmatched: number }[];
  ruleBreakdown: { rule: string; count: number }[];
}

const COLORS = [
  "hsl(210, 78%, 42%)",
  "hsl(190, 65%, 38%)",
  "hsl(25, 75%, 42%)",
  "hsl(280, 60%, 45%)",
  "hsl(145, 55%, 40%)",
  "hsl(350, 65%, 45%)",
  "hsl(45, 70%, 50%)",
];

function formatCurrency(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)} K`;
  return `₹${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  trend?: "up" | "down";
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold" data-testid={`text-kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {trend === "up" && <ArrowUpRight className="w-3 h-3 text-green-500" />}
                {trend === "down" && <ArrowDownRight className="w-3 h-3 text-red-500" />}
                {subtitle}
              </p>
            )}
          </div>
          <div className="p-2 rounded-md bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reconciliation Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of intercompany reconciliation status</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (!stats || stats.totalTransactions === 0) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reconciliation Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of intercompany reconciliation status</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No Transactions Yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Upload your intercompany transaction files to get started with reconciliation. Navigate to the Upload page to begin.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pieData = [
    { name: "Matched", value: stats.matchedTransactions },
    { name: "Unmatched", value: stats.unmatchedTransactions },
  ];
  const pieColors = ["hsl(145, 55%, 40%)", "hsl(0, 72%, 50%)"];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Reconciliation Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of intercompany reconciliation status</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Transactions"
          value={formatNumber(stats.totalTransactions)}
          icon={FileText}
        />
        <KPICard
          title="Matched"
          value={formatNumber(stats.matchedTransactions)}
          subtitle={`${stats.matchRate.toFixed(1)}% match rate`}
          icon={CheckCircle}
          trend="up"
        />
        <KPICard
          title="Unmatched"
          value={formatNumber(stats.unmatchedTransactions)}
          subtitle="Requires attention"
          icon={XCircle}
          trend="down"
        />
        <KPICard
          title="Match Rate"
          value={`${stats.matchRate.toFixed(1)}%`}
          subtitle={`${formatCurrency(stats.totalDebit)} total volume`}
          icon={TrendingUp}
          trend="up"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Company Reconciliation Status</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.companySummary.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.companySummary} margin={{ top: 5, right: 20, bottom: 60, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(210, 5%, 85%)" />
                  <XAxis
                    dataKey="company"
                    tick={{ fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(210, 5%, 96%)",
                      border: "1px solid hsl(210, 5%, 88%)",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="matched" fill="hsl(145, 55%, 40%)" name="Matched" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="unmatched" fill="hsl(0, 72%, 50%)" name="Unmatched" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Match Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={index} fill={pieColors[index]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(210, 5%, 96%)",
                        border: "1px solid hsl(210, 5%, 88%)",
                        borderRadius: "6px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: pieColors[0] }} />
                    <span className="text-xs">Matched</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: pieColors[1] }} />
                    <span className="text-xs">Unmatched</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3 pt-4">
                <h4 className="text-sm font-medium mb-2">Rule Breakdown</h4>
                {stats.ruleBreakdown.length > 0 ? (
                  stats.ruleBreakdown.map((rb, i) => (
                    <div key={rb.rule} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="text-xs truncate">{rb.rule}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {rb.count}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Run reconciliation to see rule breakdown</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {stats.companySummary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Entity Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-entity-summary">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase">Entity</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase">Total</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase">Matched</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase">Unmatched</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.companySummary.map((cs) => (
                    <tr key={cs.company} className="border-b last:border-0">
                      <td className="py-2.5 px-3 font-medium">{cs.company}</td>
                      <td className="py-2.5 px-3 text-right">{formatNumber(cs.total)}</td>
                      <td className="py-2.5 px-3 text-right text-green-600">{formatNumber(cs.matched)}</td>
                      <td className="py-2.5 px-3 text-right text-red-600">{formatNumber(cs.unmatched)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge variant={cs.total > 0 && cs.matched / cs.total > 0.9 ? "default" : "secondary"}>
                          {cs.total > 0 ? ((cs.matched / cs.total) * 100).toFixed(1) : 0}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
