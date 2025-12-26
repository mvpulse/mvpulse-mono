import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { CreatorLayout } from "@/components/layouts/CreatorLayout";
import { QuestionnaireCard } from "@/components/questionnaire";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  RefreshCcw,
  Plus,
  AlertCircle,
  ClipboardList,
} from "lucide-react";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import {
  useQuestionnaires,
  useUpdateQuestionnaire,
  QUESTIONNAIRE_STATUS,
} from "@/hooks/useQuestionnaire";
import { useToast } from "@/hooks/use-toast";

export default function ManageQuestionnaires() {
  const [, navigate] = useLocation();
  const { isConnected, address } = useWalletConnection();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Fetch questionnaires created by this user
  const {
    data: questionnaires,
    isLoading,
    refetch,
  } = useQuestionnaires({
    creator: address || undefined,
  });

  const { mutateAsync: updateQuestionnaire, isPending: isUpdatingStatus } =
    useUpdateQuestionnaire();

  // Filter by tab and search
  const filteredQuestionnaires = useMemo(() => {
    if (!questionnaires) return [];

    let filtered = questionnaires;

    // Filter by tab
    if (activeTab === "draft") {
      filtered = filtered.filter((q) => q.status === QUESTIONNAIRE_STATUS.DRAFT);
    } else if (activeTab === "active") {
      filtered = filtered.filter((q) => q.status === QUESTIONNAIRE_STATUS.ACTIVE);
    } else if (activeTab === "ended") {
      filtered = filtered.filter((q) => q.status === QUESTIONNAIRE_STATUS.ENDED);
    } else if (activeTab === "claimable") {
      filtered = filtered.filter((q) => q.status === QUESTIONNAIRE_STATUS.CLAIMABLE);
    } else if (activeTab === "archived") {
      filtered = filtered.filter((q) => q.status === QUESTIONNAIRE_STATUS.ARCHIVED);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (q) =>
          q.title.toLowerCase().includes(query) ||
          (q.description && q.description.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [questionnaires, activeTab, searchQuery]);

  // Count by status
  const statusCounts = useMemo(() => {
    if (!questionnaires) {
      return { all: 0, draft: 0, active: 0, ended: 0, claimable: 0, archived: 0 };
    }
    return {
      all: questionnaires.length,
      draft: questionnaires.filter((q) => q.status === QUESTIONNAIRE_STATUS.DRAFT).length,
      active: questionnaires.filter((q) => q.status === QUESTIONNAIRE_STATUS.ACTIVE).length,
      ended: questionnaires.filter((q) => q.status === QUESTIONNAIRE_STATUS.ENDED).length,
      claimable: questionnaires.filter((q) => q.status === QUESTIONNAIRE_STATUS.CLAIMABLE).length,
      archived: questionnaires.filter((q) => q.status === QUESTIONNAIRE_STATUS.ARCHIVED).length,
    };
  }, [questionnaires]);

  // Handle status toggle (publish/unpublish)
  const handleToggleStatus = async (id: string, newStatus: number) => {
    try {
      await updateQuestionnaire({ id, status: newStatus });
      toast({
        title: newStatus === QUESTIONNAIRE_STATUS.ACTIVE ? "Published!" : "Unpublished",
        description:
          newStatus === QUESTIONNAIRE_STATUS.ACTIVE
            ? "Your questionnaire is now live."
            : "Your questionnaire has been set to draft.",
      });
      refetch();
    } catch (error) {
      console.error("Failed to update status:", error);
      toast({
        title: "Failed to update status",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  // Handle archive
  const handleArchive = async (id: string) => {
    try {
      await updateQuestionnaire({ id, status: QUESTIONNAIRE_STATUS.ARCHIVED });
      toast({
        title: "Archived",
        description: "Your questionnaire has been archived.",
      });
      refetch();
    } catch (error) {
      console.error("Failed to archive:", error);
      toast({
        title: "Failed to archive",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  // Handle edit navigation
  const handleEdit = (id: string) => {
    navigate(`/creator/questionnaires/${id}`);
  };

  // Loading skeleton
  const CardSkeleton = () => <Skeleton className="h-64 w-full rounded-xl" />;

  if (!isConnected) {
    return (
      <CreatorLayout
        title="Manage Questionnaires"
        description="View and manage all your questionnaires"
      >
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to manage your questionnaires.
            </p>
          </CardContent>
        </Card>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout
      title="Manage Questionnaires"
      description="View and manage all your questionnaires"
    >
      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search questionnaires..."
            className="pl-10 bg-muted/30"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Link href="/questionnaire/create">
            <Button>
              <Plus className="w-4 h-4 mr-2" /> Create Questionnaire
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/30 mb-6 flex-wrap h-auto">
          <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
          <TabsTrigger value="draft">Draft ({statusCounts.draft})</TabsTrigger>
          <TabsTrigger value="active">Active ({statusCounts.active})</TabsTrigger>
          <TabsTrigger value="ended">Ended ({statusCounts.ended})</TabsTrigger>
          <TabsTrigger value="claimable">Claimable ({statusCounts.claimable})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({statusCounts.archived})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : filteredQuestionnaires.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardList className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  {searchQuery
                    ? "No questionnaires match your search."
                    : activeTab === "all"
                    ? "You haven't created any questionnaires yet."
                    : `No ${activeTab} questionnaires found.`}
                </p>
                {!searchQuery && activeTab === "all" && (
                  <>
                    <p className="text-sm text-muted-foreground mb-4">
                      Questionnaires let you group multiple polls together with shared rewards.
                    </p>
                    <Link href="/questionnaire/create">
                      <Button>
                        <Plus className="w-4 h-4 mr-2" /> Create Your First Questionnaire
                      </Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredQuestionnaires.map((questionnaire) => (
                <QuestionnaireCard
                  key={questionnaire.id}
                  questionnaire={questionnaire}
                  showCreatorActions
                  onEdit={handleEdit}
                  onArchive={handleArchive}
                  onToggleStatus={handleToggleStatus}
                  isTogglingStatus={isUpdatingStatus}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </CreatorLayout>
  );
}
