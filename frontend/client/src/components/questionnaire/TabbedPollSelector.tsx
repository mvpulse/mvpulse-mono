/**
 * TabbedPollSelector - Tab-based UI for selecting existing polls or creating new ones
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PollCreationForm, PollFormData } from "@/components/poll";
import { List, Plus, Clock, Users, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { PollWithMeta } from "@/types/poll";

interface TabbedPollSelectorProps {
  /** Available existing polls to select from */
  availablePolls: PollWithMeta[];
  /** Currently selected poll IDs */
  selectedPollIds: number[];
  /** Callback when poll selection changes */
  onSelectionChange: (pollIds: number[]) => void;
  /** Callback when a new poll is created */
  onPollCreated: (data: PollFormData) => void;
  /** Whether the polls are loading */
  isLoading?: boolean;
  /** Whether incentives should be shown (false if questionnaire has shared rewards) */
  showIncentives?: boolean;
  /** Default active tab */
  defaultTab?: "existing" | "create";
  /** Number of pending new polls (for badge display) */
  pendingNewPollsCount?: number;
  /** Inherited category from parent questionnaire (hides category field) */
  inheritedCategory?: string;
  /** Inherited duration in seconds from parent questionnaire (hides duration field) */
  inheritedDurationSecs?: number;
}

export function TabbedPollSelector({
  availablePolls,
  selectedPollIds,
  onSelectionChange,
  onPollCreated,
  isLoading = false,
  showIncentives = false,
  defaultTab = "existing",
  pendingNewPollsCount = 0,
  inheritedCategory,
  inheritedDurationSecs,
}: TabbedPollSelectorProps) {
  const handleTogglePoll = (pollId: number) => {
    if (selectedPollIds.includes(pollId)) {
      onSelectionChange(selectedPollIds.filter((id) => id !== pollId));
    } else {
      onSelectionChange([...selectedPollIds, pollId]);
    }
  };

  const handleSubmit = (data: PollFormData) => {
    onPollCreated(data);
  };

  // Format duration for display
  const formatDuration = (secs: number): string => {
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
    return `${Math.floor(secs / 86400)}d`;
  };

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="existing" className="gap-2">
          <List className="w-4 h-4" />
          Select Existing
          {availablePolls.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
              {availablePolls.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="create" className="gap-2">
          <Plus className="w-4 h-4" />
          Create New
          {pendingNewPollsCount > 0 && (
            <Badge variant="default" className="ml-1 text-[10px] px-1.5 py-0">
              +{pendingNewPollsCount}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="existing" className="mt-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : availablePolls.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm mb-2">
                No active polls available
              </p>
              <p className="text-xs text-muted-foreground">
                Switch to the "Create New" tab to add polls to your questionnaire.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {availablePolls.map((poll) => {
              const isSelected = selectedPollIds.includes(poll.id);
              return (
                <Card
                  key={poll.id}
                  className={cn(
                    "cursor-pointer transition-all",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/50 hover:bg-muted/50"
                  )}
                  onClick={() => handleTogglePoll(poll.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleTogglePoll(poll.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm truncate">
                            {poll.title}
                          </h4>
                        </div>
                        {poll.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                            {poll.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {poll.options?.length || 0} options
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {poll.totalVotes || 0} votes
                          </span>
                          {poll.end_time && poll.end_time > Math.floor(Date.now() / 1000) && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDuration(poll.end_time - Math.floor(Date.now() / 1000))} left
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {selectedPollIds.length > 0 && (
          <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-sm text-primary font-medium">
              {selectedPollIds.length} poll{selectedPollIds.length !== 1 ? "s" : ""} selected
            </p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="create" className="mt-0">
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-4">
            <PollCreationForm
              mode="embedded"
              compact
              showIncentives={showIncentives}
              onSubmit={handleSubmit}
              submitButtonText="Add Poll"
              inheritedCategory={inheritedCategory}
              inheritedDurationSecs={inheritedDurationSecs}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

export default TabbedPollSelector;
