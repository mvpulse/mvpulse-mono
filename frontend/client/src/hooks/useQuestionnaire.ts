import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Questionnaire,
  QuestionnairePoll,
  QuestionnaireProgress,
  QUESTIONNAIRE_STATUS,
  QUESTIONNAIRE_REWARD_TYPE,
} from "@shared/schema";

// Re-export types for convenience
export type {
  Questionnaire,
  QuestionnairePoll,
  QuestionnaireProgress,
};

export { QUESTIONNAIRE_STATUS, QUESTIONNAIRE_REWARD_TYPE };

export interface QuestionnaireWithPolls extends Questionnaire {
  polls: QuestionnairePoll[];
}

export interface CreateQuestionnaireInput {
  creatorAddress: string;
  title: string;
  description?: string;
  category?: string;
  startTime: string;
  endTime: string;
  rewardType?: number;
  totalRewardAmount?: string;
  coinTypeId?: number;
  rewardPerCompletion?: string;
  maxCompleters?: number;
  settings?: Record<string, unknown>;
  pollIds?: number[];
}

export interface UpdateQuestionnaireInput {
  title?: string;
  description?: string;
  category?: string;
  startTime?: string;
  endTime?: string;
  rewardType?: number;
  totalRewardAmount?: string;
  coinTypeId?: number;
  rewardPerCompletion?: string;
  maxCompleters?: number;
  settings?: Record<string, unknown>;
  status?: number;
  onChainId?: number;
}

// API client functions
async function fetchQuestionnaires(params?: {
  status?: number;
  creator?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<Questionnaire[]> {
  const searchParams = new URLSearchParams();
  if (params?.status !== undefined) searchParams.append("status", params.status.toString());
  if (params?.creator) searchParams.append("creator", params.creator);
  if (params?.category) searchParams.append("category", params.category);
  if (params?.limit) searchParams.append("limit", params.limit.toString());
  if (params?.offset) searchParams.append("offset", params.offset.toString());

  const url = `/api/questionnaires${searchParams.toString() ? `?${searchParams}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch questionnaires");
  const data = await response.json();
  return data.data;
}

async function fetchQuestionnaire(id: string): Promise<QuestionnaireWithPolls> {
  const response = await fetch(`/api/questionnaires/${id}`);
  if (!response.ok) throw new Error("Failed to fetch questionnaire");
  const data = await response.json();
  return data.data;
}

async function fetchActiveQuestionnaires(limit?: number): Promise<Questionnaire[]> {
  const url = `/api/questionnaires/active${limit ? `?limit=${limit}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch active questionnaires");
  const data = await response.json();
  return data.data;
}

async function fetchCreatorQuestionnaires(address: string): Promise<Questionnaire[]> {
  const response = await fetch(`/api/questionnaires/creator/${address}`);
  if (!response.ok) throw new Error("Failed to fetch creator questionnaires");
  const data = await response.json();
  return data.data;
}

async function fetchQuestionnaireProgress(
  questionnaireId: string,
  walletAddress: string
): Promise<QuestionnaireProgress | null> {
  const response = await fetch(`/api/questionnaires/${questionnaireId}/progress/${walletAddress}`);
  if (!response.ok) throw new Error("Failed to fetch progress");
  const data = await response.json();
  return data.data;
}

async function createQuestionnaire(input: CreateQuestionnaireInput): Promise<Questionnaire> {
  const response = await fetch("/api/questionnaires", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to create questionnaire");
  const data = await response.json();
  return data.data;
}

async function updateQuestionnaire(
  id: string,
  input: UpdateQuestionnaireInput
): Promise<Questionnaire> {
  const response = await fetch(`/api/questionnaires/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to update questionnaire");
  const data = await response.json();
  return data.data;
}

async function archiveQuestionnaire(id: string): Promise<Questionnaire> {
  const response = await fetch(`/api/questionnaires/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to archive questionnaire");
  const data = await response.json();
  return data.data;
}

async function addPollToQuestionnaire(
  questionnaireId: string,
  pollId: number,
  source: "new" | "existing" = "existing"
): Promise<QuestionnairePoll> {
  const response = await fetch(`/api/questionnaires/${questionnaireId}/polls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pollId, source }),
  });
  if (!response.ok) throw new Error("Failed to add poll");
  const data = await response.json();
  return data.data;
}

async function removePollFromQuestionnaire(
  questionnaireId: string,
  pollId: number
): Promise<void> {
  const response = await fetch(`/api/questionnaires/${questionnaireId}/polls/${pollId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to remove poll");
}

async function reorderQuestionnairePolls(
  questionnaireId: string,
  pollOrder: { pollId: number; sortOrder: number }[]
): Promise<QuestionnairePoll[]> {
  const response = await fetch(`/api/questionnaires/${questionnaireId}/polls/order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pollOrder }),
  });
  if (!response.ok) throw new Error("Failed to reorder polls");
  const data = await response.json();
  return data.data;
}

async function startQuestionnaire(
  questionnaireId: string,
  walletAddress: string
): Promise<QuestionnaireProgress> {
  const response = await fetch(`/api/questionnaires/${questionnaireId}/start/${walletAddress}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to start questionnaire");
  const data = await response.json();
  return data.data;
}

async function recordBulkVote(
  questionnaireId: string,
  walletAddress: string,
  pollIds: number[],
  optionIndices: number[],
  txHash: string
): Promise<QuestionnaireProgress> {
  const response = await fetch(`/api/questionnaires/${questionnaireId}/bulk-vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, pollIds, optionIndices, txHash }),
  });
  if (!response.ok) throw new Error("Failed to record bulk vote");
  const data = await response.json();
  return data.data;
}

// React Query hooks
export function useQuestionnaires(params?: {
  status?: number;
  creator?: string;
  category?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["questionnaires", params],
    queryFn: () => fetchQuestionnaires(params),
  });
}

export function useQuestionnaire(id: string | undefined) {
  return useQuery({
    queryKey: ["questionnaire", id],
    queryFn: () => fetchQuestionnaire(id!),
    enabled: !!id,
  });
}

export function useActiveQuestionnaires(limit?: number) {
  return useQuery({
    queryKey: ["questionnaires", "active", limit],
    queryFn: () => fetchActiveQuestionnaires(limit),
  });
}

export function useCreatorQuestionnaires(address: string | undefined) {
  return useQuery({
    queryKey: ["questionnaires", "creator", address],
    queryFn: () => fetchCreatorQuestionnaires(address!),
    enabled: !!address,
  });
}

export function useQuestionnaireProgress(
  questionnaireId: string | undefined,
  walletAddress: string | undefined
) {
  return useQuery({
    queryKey: ["questionnaire-progress", questionnaireId, walletAddress],
    queryFn: () => fetchQuestionnaireProgress(questionnaireId!, walletAddress!),
    enabled: !!questionnaireId && !!walletAddress,
  });
}

export function useCreateQuestionnaire() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createQuestionnaire,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questionnaires"] });
    },
  });
}

export function useUpdateQuestionnaire() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateQuestionnaireInput) =>
      updateQuestionnaire(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["questionnaires"] });
      queryClient.invalidateQueries({ queryKey: ["questionnaire", id] });
    },
  });
}

export function useArchiveQuestionnaire() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: archiveQuestionnaire,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questionnaires"] });
    },
  });
}

export function useAddPollToQuestionnaire() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      questionnaireId,
      pollId,
      source,
    }: {
      questionnaireId: string;
      pollId: number;
      source?: "new" | "existing";
    }) => addPollToQuestionnaire(questionnaireId, pollId, source),
    onSuccess: (_, { questionnaireId }) => {
      queryClient.invalidateQueries({ queryKey: ["questionnaire", questionnaireId] });
    },
  });
}

export function useRemovePollFromQuestionnaire() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      questionnaireId,
      pollId,
    }: {
      questionnaireId: string;
      pollId: number;
    }) => removePollFromQuestionnaire(questionnaireId, pollId),
    onSuccess: (_, { questionnaireId }) => {
      queryClient.invalidateQueries({ queryKey: ["questionnaire", questionnaireId] });
    },
  });
}

export function useReorderQuestionnairePolls() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      questionnaireId,
      pollOrder,
    }: {
      questionnaireId: string;
      pollOrder: { pollId: number; sortOrder: number }[];
    }) => reorderQuestionnairePolls(questionnaireId, pollOrder),
    onSuccess: (_, { questionnaireId }) => {
      queryClient.invalidateQueries({ queryKey: ["questionnaire", questionnaireId] });
    },
  });
}

export function useStartQuestionnaire() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      questionnaireId,
      walletAddress,
    }: {
      questionnaireId: string;
      walletAddress: string;
    }) => startQuestionnaire(questionnaireId, walletAddress),
    onSuccess: (_, { questionnaireId, walletAddress }) => {
      queryClient.invalidateQueries({
        queryKey: ["questionnaire-progress", questionnaireId, walletAddress],
      });
    },
  });
}

export function useRecordBulkVote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      questionnaireId,
      walletAddress,
      pollIds,
      optionIndices,
      txHash,
    }: {
      questionnaireId: string;
      walletAddress: string;
      pollIds: number[];
      optionIndices: number[];
      txHash: string;
    }) => recordBulkVote(questionnaireId, walletAddress, pollIds, optionIndices, txHash),
    onSuccess: (_, { questionnaireId, walletAddress }) => {
      queryClient.invalidateQueries({
        queryKey: ["questionnaire-progress", questionnaireId, walletAddress],
      });
      queryClient.invalidateQueries({ queryKey: ["questionnaire", questionnaireId] });
    },
  });
}

// Utility functions
export function getQuestionnaireStatusLabel(status: number): string {
  switch (status) {
    case QUESTIONNAIRE_STATUS.DRAFT:
      return "Draft";
    case QUESTIONNAIRE_STATUS.ACTIVE:
      return "Active";
    case QUESTIONNAIRE_STATUS.ENDED:
      return "Ended";
    case QUESTIONNAIRE_STATUS.CLAIMABLE:
      return "Claimable";
    case QUESTIONNAIRE_STATUS.ARCHIVED:
      return "Archived";
    default:
      return "Unknown";
  }
}

export function getQuestionnaireStatusColor(status: number): string {
  switch (status) {
    case QUESTIONNAIRE_STATUS.DRAFT:
      return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400";
    case QUESTIONNAIRE_STATUS.ACTIVE:
      return "bg-green-500/20 text-green-600 dark:text-green-400";
    case QUESTIONNAIRE_STATUS.ENDED:
      return "bg-gray-500/20 text-gray-600 dark:text-gray-400";
    case QUESTIONNAIRE_STATUS.CLAIMABLE:
      return "bg-blue-500/20 text-blue-600 dark:text-blue-400";
    case QUESTIONNAIRE_STATUS.ARCHIVED:
      return "bg-gray-500/20 text-gray-600 dark:text-gray-400";
    default:
      return "bg-gray-500/20 text-gray-600 dark:text-gray-400";
  }
}
