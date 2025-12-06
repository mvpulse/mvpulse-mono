import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Star, Trophy, Zap, ListChecks } from "lucide-react";
import { QuestCard, QuestCardCompact } from "./QuestCard";
import type { QuestWithProgress } from "@/hooks/useQuests";

interface QuestListProps {
  questsByType: Record<string, QuestWithProgress[]>;
  onClaim?: (questId: string) => Promise<void>;
  isClaimingId?: string;
  isLoading?: boolean;
  compact?: boolean;
}

const tabConfig = {
  Daily: { icon: Clock, color: "text-blue-500" },
  Weekly: { icon: Star, color: "text-purple-500" },
  Achievement: { icon: Trophy, color: "text-yellow-500" },
  Special: { icon: Zap, color: "text-pink-500" },
};

export function QuestList({
  questsByType,
  onClaim,
  isClaimingId,
  isLoading,
  compact = false,
}: QuestListProps) {
  const questTypes = Object.keys(questsByType);
  const totalQuests = Object.values(questsByType).flat().length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (totalQuests === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ListChecks className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Quests Available</h3>
          <p className="text-muted-foreground text-center">
            Check back later for new quests to complete!
          </p>
        </CardContent>
      </Card>
    );
  }

  // If only one type, don't show tabs
  if (questTypes.length === 1) {
    const quests = questsByType[questTypes[0]];
    return (
      <div className="space-y-4">
        {compact ? (
          <div className="space-y-2">
            {quests.map((quest) => (
              <QuestCardCompact
                key={quest.id}
                quest={quest}
                onClaim={onClaim}
                isClaiming={isClaimingId === quest.id}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {quests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onClaim={onClaim}
                isClaiming={isClaimingId === quest.id}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Tabs defaultValue={questTypes[0]} className="w-full">
      <TabsList className="w-full justify-start flex-wrap h-auto gap-2 bg-transparent p-0 mb-4">
        {questTypes.map((type) => {
          const config = tabConfig[type as keyof typeof tabConfig];
          const Icon = config?.icon || ListChecks;
          const quests = questsByType[type];
          const claimableCount = quests.filter(q => q.canClaim).length;

          return (
            <TabsTrigger
              key={type}
              value={type}
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border"
            >
              <Icon className={`w-4 h-4 mr-1.5 ${config?.color || ''}`} />
              {type}
              <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                {quests.length}
              </Badge>
              {claimableCount > 0 && (
                <Badge className="ml-1 h-5 px-1.5 bg-primary text-primary-foreground">
                  {claimableCount}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {questTypes.map((type) => {
        const quests = questsByType[type];
        return (
          <TabsContent key={type} value={type} className="mt-0">
            {compact ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2 pr-4">
                  {quests.map((quest) => (
                    <QuestCardCompact
                      key={quest.id}
                      quest={quest}
                      onClaim={onClaim}
                      isClaiming={isClaimingId === quest.id}
                    />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {quests.map((quest) => (
                  <QuestCard
                    key={quest.id}
                    quest={quest}
                    onClaim={onClaim}
                    isClaiming={isClaimingId === quest.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

// Quest summary stats
interface QuestStatsProps {
  totalQuests: number;
  completedQuests: number;
  claimableQuests: number;
  totalPoints?: number;
}

export function QuestStats({ totalQuests, completedQuests, claimableQuests, totalPoints }: QuestStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="pt-4">
          <p className="text-2xl font-bold">{totalQuests}</p>
          <p className="text-xs text-muted-foreground">Total Quests</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-2xl font-bold text-green-500">{completedQuests}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-2xl font-bold text-primary">{claimableQuests}</p>
          <p className="text-xs text-muted-foreground">Claimable</p>
        </CardContent>
      </Card>
      {totalPoints !== undefined && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-yellow-500">{totalPoints}</p>
            <p className="text-xs text-muted-foreground">Total Points</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
