import { ReactNode, useMemo, useEffect } from "react";
import { LayoutDashboard, FolderCog, Send, TrendingUp, PlusCircle, Settings, HelpCircle } from "lucide-react";
import { DashboardSidebar, type SidebarSection } from "@/components/DashboardSidebar";
import { useSidebar } from "@/contexts/SidebarContext";
import { useTour } from "@/contexts/TourContext";
import { cn } from "@/lib/utils";

interface CreatorLayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function CreatorLayout({ children, title, description }: CreatorLayoutProps) {
  const { isCollapsed } = useSidebar();
  const { hasCompletedTour, startTour, isTourRunning } = useTour();

  // Auto-start tour on first visit
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasCompletedTour("creator") && !isTourRunning) {
        startTour("creator");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [hasCompletedTour, startTour, isTourRunning]);

  // Get poll counts for badges
  const pollCount = useMemo(() => {
    // This would be populated by actual data
    // For now, return undefined to hide badges until data loads
    return undefined;
  }, []);

  const sidebarSections: SidebarSection[] = [
    {
      title: "Creator",
      items: [
        { label: "Dashboard", icon: LayoutDashboard, href: "/creator", badge: pollCount },
        { label: "Manage Polls", icon: FolderCog, href: "/creator/manage", dataTour: "sidebar-manage-polls" },
        { label: "Distributions", icon: Send, href: "/creator/distributions", dataTour: "sidebar-distributions" },
      ],
    },
    {
      title: "Quick Actions",
      items: [
        { label: "Analytics", icon: TrendingUp, href: "/creator/analytics" },
        { label: "Create Poll", icon: PlusCircle, href: "/create" },
        { label: "Settings", icon: Settings, href: "/settings" },
      ],
    },
    {
      title: "Help",
      items: [
        { label: "Start Tour", icon: HelpCircle, href: "#tour", isTourTrigger: true, dataTour: "sidebar-help" },
      ],
    },
  ];


  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <DashboardSidebar sections={sidebarSections} />

      {/* Main Content Area */}
      <div className={cn(
        "transition-all duration-300",
        isCollapsed ? "md:ml-[72px]" : "md:ml-64"
      )}>
        <div className="container max-w-6xl mx-auto px-4 py-6 md:py-8">
          {/* Page Header */}
          {title && (
            <div className="mb-8">
              <h1 className="text-3xl font-display font-bold tracking-tight">{title}</h1>
              {description && (
                <p className="text-muted-foreground mt-1">{description}</p>
              )}
            </div>
          )}

          {/* Page Content */}
          {children}
        </div>
      </div>
    </div>
  );
}
