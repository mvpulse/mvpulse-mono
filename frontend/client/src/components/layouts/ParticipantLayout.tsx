import { ReactNode } from "react";
import { LayoutDashboard, History, Gift, Compass, Settings } from "lucide-react";
import { DashboardSidebar, type SidebarSection } from "@/components/DashboardSidebar";
import { useSidebar } from "@/contexts/SidebarContext";
import { cn } from "@/lib/utils";

interface ParticipantLayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function ParticipantLayout({ children, title, description }: ParticipantLayoutProps) {
  const { isCollapsed } = useSidebar();

  const sidebarSections: SidebarSection[] = [
    {
      title: "Participant",
      items: [
        { label: "Dashboard", icon: LayoutDashboard, href: "/participant" },
        { label: "Voting History", icon: History, href: "/participant/history" },
        { label: "Rewards", icon: Gift, href: "/participant/rewards" },
      ],
    },
    {
      title: "Quick Actions",
      items: [
        { label: "Explore Polls", icon: Compass, href: "/dashboard" },
        { label: "Settings", icon: Settings, href: "/settings" },
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
