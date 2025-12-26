import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, ListChecks, ClipboardList } from "lucide-react";
import { QuestionnaireCard } from "@/components/questionnaire";
import {
  useActiveQuestionnaires,
  useCreatorQuestionnaires,
  useQuestionnaireProgress,
  QUESTIONNAIRE_STATUS,
} from "@/hooks/useQuestionnaire";
import { useContract } from "@/hooks/useContract";

export default function Questionnaires() {
  const { activeAddress } = useContract();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Fetch active questionnaires
  const {
    data: activeQuestionnaires,
    isLoading: isLoadingActive,
    error: activeError,
  } = useActiveQuestionnaires(50);

  // Fetch user's created questionnaires
  const {
    data: creatorQuestionnaires,
    isLoading: isLoadingCreator,
  } = useCreatorQuestionnaires(activeAddress || undefined);

  // Filter questionnaires based on search and category
  const filteredQuestionnaires = activeQuestionnaires?.filter((q) => {
    const matchesSearch =
      !searchTerm ||
      q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || q.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = Array.from(
    new Set(
      activeQuestionnaires
        ?.map((q) => q.category)
        .filter((c): c is string => !!c) || []
    )
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ClipboardList className="h-8 w-8" />
            Questionnaires
          </h1>
          <p className="text-muted-foreground mt-1">
            Answer grouped polls and earn rewards
          </p>
        </div>
        {activeAddress && (
          <Link href="/questionnaire/create">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Questionnaire
            </Button>
          </Link>
        )}
      </div>

      <Tabs defaultValue="browse" className="space-y-6">
        <TabsList>
          <TabsTrigger value="browse" className="gap-2">
            <ListChecks className="h-4 w-4" />
            Browse
          </TabsTrigger>
          {activeAddress && (
            <TabsTrigger value="my-questionnaires" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              My Questionnaires
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="browse" className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search questionnaires..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            {categories.length > 0 && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Questionnaire Grid */}
          {isLoadingActive ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6 space-y-4">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                    <div className="flex gap-4">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : activeError ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-destructive">
                  Failed to load questionnaires. Please try again.
                </p>
              </CardContent>
            </Card>
          ) : filteredQuestionnaires && filteredQuestionnaires.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredQuestionnaires.map((questionnaire) => (
                <QuestionnaireCardWithProgress
                  key={questionnaire.id}
                  questionnaire={questionnaire}
                  walletAddress={activeAddress}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Questionnaires Found</h3>
                <p className="text-muted-foreground mt-2">
                  {searchTerm || categoryFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Be the first to create a questionnaire!"}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {activeAddress && (
          <TabsContent value="my-questionnaires" className="space-y-6">
            {isLoadingCreator ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6 space-y-4">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : creatorQuestionnaires && creatorQuestionnaires.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {creatorQuestionnaires.map((questionnaire) => (
                  <QuestionnaireCard
                    key={questionnaire.id}
                    questionnaire={questionnaire}
                    showCreatorActions
                    onEdit={(id) =>
                      (window.location.href = `/questionnaire/edit/${id}`)
                    }
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Questionnaires Yet</h3>
                  <p className="text-muted-foreground mt-2">
                    Create your first questionnaire to get started.
                  </p>
                  <Link href="/questionnaire/create">
                    <Button className="mt-4">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Questionnaire
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// Wrapper component to fetch progress for each questionnaire card
function QuestionnaireCardWithProgress({
  questionnaire,
  walletAddress,
}: {
  questionnaire: any;
  walletAddress: string | null | undefined;
}) {
  const { data: progress } = useQuestionnaireProgress(
    questionnaire.id,
    walletAddress || undefined
  );

  return (
    <QuestionnaireCard questionnaire={questionnaire} progress={progress} />
  );
}
