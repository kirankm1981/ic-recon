import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Upload,
  GitCompare,
  Settings2,
  FileText,
  AlertTriangle,
  DatabaseZap,
  Loader2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Upload", url: "/upload", icon: Upload },
  { title: "Workspace", url: "/workspace", icon: GitCompare },
  { title: "Exceptions", url: "/exceptions", icon: AlertTriangle },
];

const configItems = [
  { title: "Rule Config", url: "/rules", icon: Settings2 },
  { title: "Audit Trail", url: "/audit", icon: FileText },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [flushDialogOpen, setFlushDialogOpen] = useState(false);

  const flushMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/transactions/clear", { method: "POST" });
      if (!res.ok) throw new Error("Failed to flush database");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Database Flushed", description: "All transactions, reconciliation data, and upload history have been cleared." });
      setFlushDialogOpen(false);
      queryClient.invalidateQueries();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to flush database", variant: "destructive" });
    },
  });

  return (
    <>
      <Sidebar>
        <SidebarHeader className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
              <GitCompare className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white" data-testid="text-app-name">IC Recon</p>
              <p className="text-[11px] text-sidebar-foreground/60 font-medium">Intercompany Platform</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Main</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={location === item.url}
                    >
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Configuration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {configItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={location === item.url}
                    >
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive"
            onClick={() => setFlushDialogOpen(true)}
            data-testid="button-flush-database"
          >
            <DatabaseZap className="w-4 h-4" />
            Flush Database
          </Button>
        </SidebarFooter>
      </Sidebar>

      <Dialog open={flushDialogOpen} onOpenChange={setFlushDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flush Database</DialogTitle>
            <DialogDescription>
              This will permanently delete all uploaded transactions, reconciliation results, and upload history. Reconciliation rules will be preserved. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setFlushDialogOpen(false)}
              data-testid="button-flush-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => flushMutation.mutate()}
              disabled={flushMutation.isPending}
              data-testid="button-flush-confirm"
            >
              {flushMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Flushing...
                </>
              ) : (
                <>
                  <DatabaseZap className="w-4 h-4 mr-2" />
                  Flush All Data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
