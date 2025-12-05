import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSidebar } from "@/contexts/SidebarContext";
import { useTour, type TourRole } from "@/contexts/TourContext";
import type { LucideIcon } from "lucide-react";

export interface SidebarItem {
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: number | string;
  dataTour?: string;
  isTourTrigger?: boolean;
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

interface DashboardSidebarProps {
  sections: SidebarSection[];
}

export function DashboardSidebar({ sections }: DashboardSidebarProps) {
  const [location] = useLocation();
  const { isCollapsed, toggle } = useSidebar();
  const { startTour } = useTour();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Determine tour role based on current location
  const getTourRole = (): TourRole | null => {
    if (location.startsWith("/creator")) return "creator";
    if (location.startsWith("/participant")) return "participant";
    return null;
  };

  // Close mobile sheet on navigation
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location]);

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn(
      "flex flex-col h-full",
      !mobile && "py-4"
    )}>
      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 space-y-6">
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            {section.title && (
              <h3 className={cn(
                "px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                isCollapsed && !mobile && "sr-only"
              )}>
                {section.title}
              </h3>
            )}
            <nav className="space-y-1">
              {section.items.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href + "/");

                // Handle tour trigger button
                if (item.isTourTrigger) {
                  return (
                    <button
                      key={item.href}
                      onClick={() => {
                        const role = getTourRole();
                        if (role) startTour(role);
                      }}
                      data-tour={item.dataTour}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full",
                        "hover:bg-primary/10 hover:text-primary",
                        "text-muted-foreground",
                        isCollapsed && !mobile && "justify-center px-2"
                      )}
                      title={isCollapsed && !mobile ? item.label : undefined}
                    >
                      <item.icon className={cn(
                        "shrink-0",
                        isCollapsed && !mobile ? "w-5 h-5" : "w-4 h-4"
                      )} />
                      {(!isCollapsed || mobile) && (
                        <span className="flex-1 text-left">{item.label}</span>
                      )}
                    </button>
                  );
                }

                // Regular link rendering
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-tour={item.dataTour}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      "hover:bg-primary/10 hover:text-primary",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                      isCollapsed && !mobile && "justify-center px-2"
                    )}
                    title={isCollapsed && !mobile ? item.label : undefined}
                  >
                    <item.icon className={cn(
                      "shrink-0",
                      isCollapsed && !mobile ? "w-5 h-5" : "w-4 h-4"
                    )} />
                    {(!isCollapsed || mobile) && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.badge !== undefined && (
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            isActive
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Collapse Toggle - Desktop only */}
      {!mobile && (
        <div className="px-3 pt-4 border-t border-border/50">
          <button
            onClick={toggle}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium",
              "text-muted-foreground hover:bg-muted hover:text-foreground transition-all",
              isCollapsed && "justify-center px-2"
            )}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:flex flex-col fixed left-0 top-16 bottom-0 z-40",
        "bg-background border-r border-border/50 transition-all duration-300",
        isCollapsed ? "w-[72px]" : "w-64"
      )}>
        <SidebarContent />
      </aside>

      {/* Mobile Trigger & Sheet */}
      <div className="md:hidden fixed top-[72px] left-4 z-40">
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 bg-background/80 backdrop-blur-sm">
              <Menu className="h-4 w-4" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 pt-6">
            <SidebarContent mobile />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
