import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreatorLayout } from "@/components/layouts/CreatorLayout";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useSeason } from "@/hooks/useQuests";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trophy,
  Target,
  Flame,
  Star,
  Zap,
  Calendar,
  Vote,
  Gift,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle
} from "lucide-react";
import { QUEST_TYPES, QUEST_TYPE_NAMES, type Quest } from "@shared/schema";

// Quest Templates for creators to choose from
interface QuestTemplate {
  id: string;
  name: string;
  description: string;
  icon: typeof Trophy;
  questType: number;
  points: number;
  targetValue: number;
  targetAction: string;
  category: "engagement" | "loyalty" | "milestone" | "special";
}

const QUEST_TEMPLATES: QuestTemplate[] = [
  // Engagement Quests (Daily)
  {
    id: "daily-voter",
    name: "Daily Voter",
    description: "Vote on 3 polls today",
    icon: Vote,
    questType: QUEST_TYPES.DAILY,
    points: 50,
    targetValue: 3,
    targetAction: "vote",
    category: "engagement",
  },
  {
    id: "active-participant",
    name: "Active Participant",
    description: "Vote on 5 polls today",
    icon: Target,
    questType: QUEST_TYPES.DAILY,
    points: 100,
    targetValue: 5,
    targetAction: "vote",
    category: "engagement",
  },
  {
    id: "power-voter",
    name: "Power Voter",
    description: "Vote on 10 polls today",
    icon: Zap,
    questType: QUEST_TYPES.DAILY,
    points: 200,
    targetValue: 10,
    targetAction: "vote",
    category: "engagement",
  },
  // Loyalty Quests (Weekly)
  {
    id: "weekly-warrior",
    name: "Weekly Warrior",
    description: "Vote on 20 polls this week",
    icon: Trophy,
    questType: QUEST_TYPES.WEEKLY,
    points: 300,
    targetValue: 20,
    targetAction: "vote",
    category: "loyalty",
  },
  {
    id: "dedicated-voter",
    name: "Dedicated Voter",
    description: "Vote on 50 polls this week",
    icon: Star,
    questType: QUEST_TYPES.WEEKLY,
    points: 750,
    targetValue: 50,
    targetAction: "vote",
    category: "loyalty",
  },
  // Milestone Quests (Achievement)
  {
    id: "streak-starter",
    name: "Streak Starter",
    description: "Maintain a 7-day voting streak",
    icon: Flame,
    questType: QUEST_TYPES.ACHIEVEMENT,
    points: 500,
    targetValue: 7,
    targetAction: "streak",
    category: "milestone",
  },
  {
    id: "streak-master",
    name: "Streak Master",
    description: "Maintain a 30-day voting streak",
    icon: Flame,
    questType: QUEST_TYPES.ACHIEVEMENT,
    points: 2000,
    targetValue: 30,
    targetAction: "streak",
    category: "milestone",
  },
  {
    id: "century-voter",
    name: "Century Voter",
    description: "Cast 100 total votes",
    icon: CheckCircle2,
    questType: QUEST_TYPES.ACHIEVEMENT,
    points: 1000,
    targetValue: 100,
    targetAction: "total_votes",
    category: "milestone",
  },
  // Special Quests
  {
    id: "early-bird",
    name: "Early Bird",
    description: "Be among the first 100 to vote on a new poll",
    icon: Clock,
    questType: QUEST_TYPES.SPECIAL,
    points: 250,
    targetValue: 1,
    targetAction: "early_vote",
    category: "special",
  },
  {
    id: "reward-hunter",
    name: "Reward Hunter",
    description: "Claim 5 poll rewards",
    icon: Gift,
    questType: QUEST_TYPES.SPECIAL,
    points: 400,
    targetValue: 5,
    targetAction: "claim_reward",
    category: "special",
  },
];

const CATEGORY_INFO = {
  engagement: { label: "Engagement", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  loyalty: { label: "Loyalty", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  milestone: { label: "Milestone", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  special: { label: "Special", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
};

interface CreateQuestForm {
  name: string;
  description: string;
  questType: number;
  points: number;
  targetValue: number;
  targetAction: string;
}

export default function QuestManager() {
  const { isConnected, address } = useWalletConnection();
  const { season, isLoading: isSeasonLoading } = useSeason();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<QuestTemplate | null>(null);
  const [customForm, setCustomForm] = useState<CreateQuestForm>({
    name: "",
    description: "",
    questType: QUEST_TYPES.DAILY,
    points: 100,
    targetValue: 1,
    targetAction: "vote",
  });

  // Fetch quests created by this creator
  const { data: creatorQuests = [], isLoading: isQuestsLoading } = useQuery<Quest[]>({
    queryKey: ["creatorQuests", address, season?.id],
    queryFn: async () => {
      if (!address || !season?.id) return [];
      const res = await fetch(`/api/quests/creator/${address}?seasonId=${season.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch quests");
      const data = await res.json();
      return data.quests || [];
    },
    enabled: !!address && !!season?.id,
  });

  // Create quest mutation
  const createQuestMutation = useMutation({
    mutationFn: async (questData: CreateQuestForm) => {
      if (!address || !season?.id) throw new Error("No wallet or season");

      const res = await apiRequest("POST", "/api/quests", {
        ...questData,
        seasonId: season.id,
        creatorAddress: address,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creatorQuests", address, season?.id] });
      setIsCreateDialogOpen(false);
      setSelectedTemplate(null);
      setCustomForm({
        name: "",
        description: "",
        questType: QUEST_TYPES.DAILY,
        points: 100,
        targetValue: 1,
        targetAction: "vote",
      });
      toast({
        title: "Quest Created",
        description: "Your quest has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create quest",
        variant: "destructive",
      });
    },
  });

  const handleTemplateSelect = (template: QuestTemplate) => {
    setSelectedTemplate(template);
    setCustomForm({
      name: template.name,
      description: template.description,
      questType: template.questType,
      points: template.points,
      targetValue: template.targetValue,
      targetAction: template.targetAction,
    });
  };

  const handleCreateQuest = () => {
    if (!customForm.name || !customForm.targetAction || customForm.points < 1) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    createQuestMutation.mutate(customForm);
  };

  const questsByType = useMemo(() => {
    return creatorQuests.reduce((acc, quest) => {
      const typeName = QUEST_TYPE_NAMES[quest.questType as keyof typeof QUEST_TYPE_NAMES] || "Other";
      if (!acc[typeName]) acc[typeName] = [];
      acc[typeName].push(quest);
      return acc;
    }, {} as Record<string, Quest[]>);
  }, [creatorQuests]);

  if (!isConnected) {
    return (
      <CreatorLayout title="Quest Manager" description="Create and manage quests for your community">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Connect Your Wallet</p>
            <p className="text-muted-foreground text-sm mt-1">
              Please connect your wallet to manage quests
            </p>
          </CardContent>
        </Card>
      </CreatorLayout>
    );
  }

  if (isSeasonLoading) {
    return (
      <CreatorLayout title="Quest Manager" description="Create and manage quests for your community">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </CreatorLayout>
    );
  }

  if (!season) {
    return (
      <CreatorLayout title="Quest Manager" description="Create and manage quests for your community">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No Active Season</p>
            <p className="text-muted-foreground text-sm mt-1">
              Quests can only be created during an active season
            </p>
          </CardContent>
        </Card>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout title="Quest Manager" description="Create and manage quests for your community">
      {/* Season Info */}
      <Card className="mb-6 bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm text-muted-foreground">Current Season</p>
            <p className="text-lg font-semibold">{season.name}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Ends in</p>
            <p className="text-lg font-semibold">{season.daysRemaining} days</p>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Trophy className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{creatorQuests.length}</p>
                <p className="text-sm text-muted-foreground">Total Quests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{creatorQuests.filter(q => q.active).length}</p>
                <p className="text-sm text-muted-foreground">Active Quests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Star className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {creatorQuests.reduce((sum, q) => sum + q.points, 0).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Total Points</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Quest Button */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Your Quests</h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Quest
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Quest</DialogTitle>
              <DialogDescription>
                Choose from a template or create a custom quest for your community
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="templates" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>

              <TabsContent value="templates" className="mt-4">
                <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2">
                  {Object.entries(
                    QUEST_TEMPLATES.reduce((acc, template) => {
                      if (!acc[template.category]) acc[template.category] = [];
                      acc[template.category].push(template);
                      return acc;
                    }, {} as Record<string, QuestTemplate[]>)
                  ).map(([category, templates]) => (
                    <div key={category}>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2 capitalize">
                        {CATEGORY_INFO[category as keyof typeof CATEGORY_INFO].label}
                      </h4>
                      <div className="space-y-2">
                        {templates.map((template) => {
                          const Icon = template.icon;
                          const isSelected = selectedTemplate?.id === template.id;
                          return (
                            <div
                              key={template.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/50"
                              }`}
                              onClick={() => handleTemplateSelect(template)}
                            >
                              <div className={`p-2 rounded-lg ${CATEGORY_INFO[template.category].color}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{template.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {template.description}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <Badge variant="outline" className="text-xs">
                                  {template.points} pts
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {selectedTemplate && (
                  <div className="mt-4 p-4 rounded-lg border bg-muted/50">
                    <h4 className="font-medium mb-2">Selected Template</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Name</p>
                        <p className="font-medium">{selectedTemplate.name}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Type</p>
                        <p className="font-medium">
                          {QUEST_TYPE_NAMES[selectedTemplate.questType as keyof typeof QUEST_TYPE_NAMES]}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Points</p>
                        <p className="font-medium">{selectedTemplate.points}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Target</p>
                        <p className="font-medium">
                          {selectedTemplate.targetValue} {selectedTemplate.targetAction}(s)
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="custom" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Quest Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Super Voter"
                    value={customForm.name}
                    onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what participants need to do..."
                    value={customForm.description}
                    onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="questType">Quest Type</Label>
                    <Select
                      value={String(customForm.questType)}
                      onValueChange={(v) => setCustomForm({ ...customForm, questType: Number(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={String(QUEST_TYPES.DAILY)}>Daily</SelectItem>
                        <SelectItem value={String(QUEST_TYPES.WEEKLY)}>Weekly</SelectItem>
                        <SelectItem value={String(QUEST_TYPES.ACHIEVEMENT)}>Achievement</SelectItem>
                        <SelectItem value={String(QUEST_TYPES.SPECIAL)}>Special</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="targetAction">Action Type</Label>
                    <Select
                      value={customForm.targetAction}
                      onValueChange={(v) => setCustomForm({ ...customForm, targetAction: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vote">Vote</SelectItem>
                        <SelectItem value="streak">Streak Days</SelectItem>
                        <SelectItem value="total_votes">Total Votes</SelectItem>
                        <SelectItem value="claim_reward">Claim Rewards</SelectItem>
                        <SelectItem value="early_vote">Early Vote</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="targetValue">Target Value</Label>
                    <Input
                      id="targetValue"
                      type="number"
                      min={1}
                      value={customForm.targetValue}
                      onChange={(e) => setCustomForm({ ...customForm, targetValue: Number(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      How many times the action must be performed
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="points">Points Reward</Label>
                    <Input
                      id="points"
                      type="number"
                      min={1}
                      value={customForm.points}
                      onChange={(e) => setCustomForm({ ...customForm, points: Number(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Points awarded on completion
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateQuest}
                disabled={createQuestMutation.isPending || !customForm.name}
              >
                {createQuestMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Quest
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quest List */}
      {isQuestsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : creatorQuests.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No Quests Yet</p>
            <p className="text-muted-foreground text-sm mt-1 text-center max-w-sm">
              Create your first quest to engage your community and reward participants
            </p>
            <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Quest
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(questsByType).map(([typeName, typeQuests]) => (
            <div key={typeName}>
              <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                <Badge variant="outline">{typeName}</Badge>
                <span className="text-sm text-muted-foreground">({typeQuests.length})</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {typeQuests.map((quest) => (
                  <Card key={quest.id} className={!quest.active ? "opacity-60" : ""}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{quest.name}</CardTitle>
                          <CardDescription className="mt-1">{quest.description}</CardDescription>
                        </div>
                        <Badge variant={quest.active ? "default" : "secondary"}>
                          {quest.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Target className="h-4 w-4" />
                            {quest.targetValue} {quest.targetAction}
                          </span>
                        </div>
                        <Badge variant="outline" className="font-mono">
                          {quest.points} pts
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </CreatorLayout>
  );
}
