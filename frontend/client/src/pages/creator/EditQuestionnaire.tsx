/**
 * EditQuestionnaire - Edit a draft questionnaire
 * Only DRAFT questionnaires can be edited. Published questionnaires are read-only.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { CreatorLayout } from "@/components/layouts/CreatorLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowLeft,
  Save,
  Loader2,
  Lock,
  Trash2,
  Plus,
  GripVertical,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useQuestionnaire,
  useUpdateQuestionnaire,
  useRemovePollFromQuestionnaire,
  useReorderQuestionnairePolls,
  QUESTIONNAIRE_STATUS,
  getQuestionnaireStatusLabel,
  getQuestionnaireStatusColor,
  type QuestionnairePoll,
} from "@/hooks/useQuestionnaire";
import { useContract } from "@/hooks/useContract";
import { DurationInput } from "@/components/ui/duration-input";
import { useDurationInput } from "@/hooks/useDurationInput";

// Categories (same as CreateQuestionnaire)
const CATEGORIES = [
  { value: "governance", label: "Governance" },
  { value: "product", label: "Product Research" },
  { value: "community", label: "Community" },
  { value: "marketing", label: "Marketing" },
  { value: "technical", label: "Technical" },
  { value: "ecosystem", label: "Ecosystem" },
  { value: "partnerships", label: "Partnerships" },
  { value: "other", label: "Other" },
];

export default function EditQuestionnaire() {
  const [, params] = useRoute("/creator/questionnaires/:id");
  const [, navigate] = useLocation();
  const questionnaireId = params?.id;
  const { toast } = useToast();
  const { activeAddress } = useContract();

  // Fetch questionnaire
  const {
    data: questionnaire,
    isLoading,
    error,
    refetch,
  } = useQuestionnaire(questionnaireId);

  // Mutations
  const updateMutation = useUpdateQuestionnaire();
  const removePollMutation = useRemovePollFromQuestionnaire();
  const reorderMutation = useReorderQuestionnairePolls();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Duration state
  const durationInput = useDurationInput("custom");

  // Local polls state for drag-and-drop reordering
  const [localPolls, setLocalPolls] = useState<QuestionnairePoll[]>([]);
  const [draggedPollId, setDraggedPollId] = useState<number | null>(null);

  // Initialize form when questionnaire loads
  useEffect(() => {
    if (questionnaire) {
      setTitle(questionnaire.title);
      setDescription(questionnaire.description || "");
      setCategory(questionnaire.category || "");

      // Set duration dates
      if (questionnaire.startTime) {
        durationInput.setStartDate(
          new Date(questionnaire.startTime).toISOString().slice(0, 16)
        );
      }
      if (questionnaire.endTime) {
        durationInput.setEndDate(
          new Date(questionnaire.endTime).toISOString().slice(0, 16)
        );
      }

      // Initialize local polls sorted by sortOrder
      if (questionnaire.polls) {
        setLocalPolls([...questionnaire.polls].sort((a, b) => a.sortOrder - b.sortOrder));
      }
    }
  }, [questionnaire]);

  // Track changes
  useEffect(() => {
    if (!questionnaire) return;

    const hasBasicChanges =
      title !== questionnaire.title ||
      description !== (questionnaire.description || "") ||
      category !== (questionnaire.category || "");

    setHasChanges(hasBasicChanges);
  }, [title, description, category, questionnaire]);

  // Check if editable (only DRAFT status)
  const isEditable = questionnaire?.status === QUESTIONNAIRE_STATUS.DRAFT;

  // Check if user is the creator
  const isCreator =
    activeAddress &&
    questionnaire?.creatorAddress?.toLowerCase() === activeAddress.toLowerCase();

  // Handle save
  const handleSave = async () => {
    if (!questionnaireId || !isEditable) return;

    try {
      await updateMutation.mutateAsync({
        id: questionnaireId,
        title,
        description: description || undefined,
        category: category || undefined,
        startTime: new Date(durationInput.startDate).toISOString(),
        endTime: new Date(durationInput.endDate).toISOString(),
      });

      toast({
        title: "Saved!",
        description: "Questionnaire updated successfully.",
      });

      setHasChanges(false);
      refetch();
    } catch (err) {
      console.error("Failed to save:", err);
      toast({
        title: "Save Failed",
        description: err instanceof Error ? err.message : "Failed to save changes",
        variant: "destructive",
      });
    }
  };

  // Handle remove poll
  const handleRemovePoll = async (pollId: number) => {
    if (!questionnaireId || !isEditable) return;

    try {
      await removePollMutation.mutateAsync({
        questionnaireId,
        pollId,
      });

      toast({
        title: "Poll Removed",
        description: "Poll has been removed from the questionnaire.",
      });

      refetch();
    } catch (err) {
      console.error("Failed to remove poll:", err);
      toast({
        title: "Remove Failed",
        description: err instanceof Error ? err.message : "Failed to remove poll",
        variant: "destructive",
      });
    }
  };

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, pollId: number) => {
    setDraggedPollId(pollId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", pollId.toString());
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, targetPollId: number) => {
    e.preventDefault();
    if (draggedPollId === null || draggedPollId === targetPollId) return;

    setLocalPolls((prevPolls) => {
      const draggedIndex = prevPolls.findIndex((p) => p.pollId === draggedPollId);
      const targetIndex = prevPolls.findIndex((p) => p.pollId === targetPollId);

      if (draggedIndex === -1 || targetIndex === -1) return prevPolls;

      const newPolls = [...prevPolls];
      const [draggedPoll] = newPolls.splice(draggedIndex, 1);
      newPolls.splice(targetIndex, 0, draggedPoll);

      return newPolls;
    });
  }, [draggedPollId]);

  const handleDragEnd = useCallback(async () => {
    if (draggedPollId === null || !questionnaireId) {
      setDraggedPollId(null);
      return;
    }

    // Save the new order to backend
    const pollOrder = localPolls.map((poll, index) => ({
      pollId: poll.pollId,
      sortOrder: index,
    }));

    try {
      await reorderMutation.mutateAsync({
        questionnaireId,
        pollOrder,
      });

      toast({
        title: "Order Updated",
        description: "Poll order has been saved.",
      });
    } catch (err) {
      console.error("Failed to reorder polls:", err);
      toast({
        title: "Reorder Failed",
        description: err instanceof Error ? err.message : "Failed to save poll order",
        variant: "destructive",
      });
      // Revert to original order on failure
      if (questionnaire?.polls) {
        setLocalPolls([...questionnaire.polls].sort((a, b) => a.sortOrder - b.sortOrder));
      }
    }

    setDraggedPollId(null);
  }, [draggedPollId, questionnaireId, localPolls, reorderMutation, toast, questionnaire]);

  // Loading state
  if (isLoading) {
    return (
      <CreatorLayout
        title="Edit Questionnaire"
        description="Loading..."
      >
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </CreatorLayout>
    );
  }

  // Error state
  if (error || !questionnaire) {
    return (
      <CreatorLayout
        title="Edit Questionnaire"
        description="Questionnaire not found"
      >
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="text-lg font-medium">Questionnaire Not Found</h3>
            <p className="text-muted-foreground mt-2">
              The questionnaire you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/creator/questionnaires">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Questionnaires
              </Button>
            </Link>
          </CardContent>
        </Card>
      </CreatorLayout>
    );
  }

  // Not the creator
  if (!isCreator) {
    return (
      <CreatorLayout
        title="Edit Questionnaire"
        description="Access denied"
      >
        <Card>
          <CardContent className="py-12 text-center">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Access Denied</h3>
            <p className="text-muted-foreground mt-2">
              You don't have permission to edit this questionnaire.
            </p>
            <Link href="/creator/questionnaires">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Questionnaires
              </Button>
            </Link>
          </CardContent>
        </Card>
      </CreatorLayout>
    );
  }

  // Not editable (not DRAFT)
  if (!isEditable) {
    return (
      <CreatorLayout
        title="Edit Questionnaire"
        description="This questionnaire cannot be edited"
      >
        <div className="space-y-6">
          <Link href="/creator/questionnaires">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Questionnaires
            </Button>
          </Link>

          <Card className="border-yellow-500/50 bg-yellow-500/10">
            <CardContent className="flex items-center gap-3 py-6">
              <Lock className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="font-medium text-yellow-600 dark:text-yellow-400">
                  This questionnaire cannot be edited
                </p>
                <p className="text-sm text-yellow-600/80 dark:text-yellow-400/80">
                  Only draft questionnaires can be edited. This questionnaire is{" "}
                  <Badge className={getQuestionnaireStatusColor(questionnaire.status)}>
                    {getQuestionnaireStatusLabel(questionnaire.status)}
                  </Badge>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Read-only view */}
          <Card>
            <CardHeader>
              <CardTitle>{questionnaire.title}</CardTitle>
              {questionnaire.description && (
                <CardDescription>{questionnaire.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Category:</span>
                  <p className="font-medium">{questionnaire.category || "None"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Polls:</span>
                  <p className="font-medium">{questionnaire.pollCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Completions:</span>
                  <p className="font-medium">{questionnaire.completionCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className={getQuestionnaireStatusColor(questionnaire.status)}>
                    {getQuestionnaireStatusLabel(questionnaire.status)}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Link href={`/questionnaire/${questionnaire.id}`}>
              <Button variant="outline">View Questionnaire</Button>
            </Link>
            <Link href="/creator/questionnaires">
              <Button variant="ghost">Back to List</Button>
            </Link>
          </div>
        </div>
      </CreatorLayout>
    );
  }

  // Editable form (DRAFT status)
  return (
    <CreatorLayout
      title="Edit Questionnaire"
      description="Edit your draft questionnaire"
    >
      <div className="space-y-6">
        {/* Back button */}
        <div className="flex items-center justify-between">
          <Link href="/creator/questionnaires">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Questionnaires
            </Button>
          </Link>
          <Badge variant="secondary">Draft</Badge>
        </div>

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Edit the title, description, and settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Questionnaire title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your questionnaire"
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DurationInput
              mode={durationInput.mode}
              onModeChange={durationInput.setMode}
              fixedDuration={durationInput.fixedDuration}
              onFixedDurationChange={durationInput.setFixedDuration}
              startDate={durationInput.startDate}
              endDate={durationInput.endDate}
              onStartDateChange={durationInput.setStartDate}
              onEndDateChange={durationInput.setEndDate}
              label="Duration"
            />
          </CardContent>
        </Card>

        {/* Polls */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Polls ({localPolls.length})</CardTitle>
                <CardDescription>
                  Drag to reorder polls. Changes are saved automatically.
                </CardDescription>
              </div>
              <Link href={`/questionnaire/create?addTo=${questionnaire.id}`}>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Poll
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {localPolls.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No polls added yet.</p>
                <p className="text-sm mt-1">
                  Add at least 2 polls before publishing.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {localPolls.map((poll, index) => (
                  <div
                    key={poll.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, poll.pollId)}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, poll.pollId)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-3 border rounded-lg transition-all ${
                      draggedPollId === poll.pollId
                        ? "opacity-50 border-primary bg-primary/10"
                        : "bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                    <span className="text-muted-foreground w-6">
                      {index + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        Poll #{poll.pollId}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemovePoll(poll.pollId)}
                      disabled={removePollMutation.isPending || reorderMutation.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {reorderMutation.isPending && (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving order...
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {hasChanges && "You have unsaved changes"}
          </div>
          <div className="flex gap-3">
            <Link href="/creator/questionnaires">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </CreatorLayout>
  );
}
