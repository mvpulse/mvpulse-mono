import { ReactNode, useEffect } from "react";
import { LayoutDashboard, Compass, Heart, History, TrendingUp, Settings, HelpCircle } from "lucide-react";
import { DashboardSidebar, type SidebarSection } from "@/components/DashboardSidebar";
import { useSidebar } from "@/contexts/SidebarContext";
import { useTour } from "@/contexts/TourContext";
import { cn } from "@/lib/utils";

interface DonorLayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function DonorLayout({ children, title, description }: DonorLayoutProps) {
  const { isCollapsed } = useSidebar();
  const { hasCompletedTour, startTour, isTourRunning } = useTour();

  // Auto-start tour on first visit
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasCompletedTour("donor") && !isTourRunning) {
        startTour("donor");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [hasCompletedTour, startTour, isTourRunning]);

  const sidebarSections: SidebarSection[] = [
    {
      title: "Donor",
      items: [
        { label: "Dashboard", icon: LayoutDashboard, href: "/donor" },
        { label: "Explore Polls", icon: Compass, href: "/donor/explore", dataTour: "sidebar-explore" },
        { label: "Funded Polls", icon: Heart, href: "/donor/funded", dataTour: "sidebar-funded" },
        { label: "Funding History", icon: History, href: "/donor/history", dataTour: "sidebar-history" },
      ],
    },
    {
      title: "Quick Actions",
      items: [
        { label: "Trending", icon: TrendingUp, href: "/donor/trending" },
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
