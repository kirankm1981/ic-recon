import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import UploadPage from "@/pages/upload";
import Workspace from "@/pages/workspace";
import Exceptions from "@/pages/exceptions";
import RuleConfig from "@/pages/rule-config";
import AuditTrail from "@/pages/audit-trail";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/upload" component={UploadPage} />
      <Route path="/workspace" component={Workspace} />
      <Route path="/exceptions" component={Exceptions} />
      <Route path="/rules" component={RuleConfig} />
      <Route path="/audit" component={AuditTrail} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <header className="flex items-center gap-2 p-2 border-b shrink-0">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <span className="text-xs text-muted-foreground">Intercompany Reconciliation Platform</span>
              </header>
              <main className="flex-1 overflow-auto">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
