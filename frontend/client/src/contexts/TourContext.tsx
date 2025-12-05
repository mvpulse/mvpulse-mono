import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type TourRole = "creator" | "participant";

interface TourContextType {
  // Tour state
  isTourRunning: boolean;
  currentRole: TourRole | null;
  stepIndex: number;

  // Tour actions
  startTour: (role: TourRole) => void;
  stopTour: () => void;
  setStepIndex: (index: number) => void;

  // Completion tracking
  hasCompletedTour: (role: TourRole) => boolean;
  markTourComplete: (role: TourRole) => void;
  resetTourCompletion: (role: TourRole) => void;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

// localStorage keys
const TOUR_STORAGE_KEYS = {
  creator: "mvpulse_tour_completed_creator",
  participant: "mvpulse_tour_completed_participant",
} as const;

interface TourProviderProps {
  children: ReactNode;
}

export function TourProvider({ children }: TourProviderProps) {
  const [isTourRunning, setIsTourRunning] = useState(false);
  const [currentRole, setCurrentRole] = useState<TourRole | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  // Check if tour has been completed for a role
  const hasCompletedTour = useCallback((role: TourRole): boolean => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(TOUR_STORAGE_KEYS[role]) === "true";
  }, []);

  // Mark tour as complete
  const markTourComplete = useCallback((role: TourRole) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TOUR_STORAGE_KEYS[role], "true");
    }
  }, []);

  // Reset tour completion (for "Start Tour" button)
  const resetTourCompletion = useCallback((role: TourRole) => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOUR_STORAGE_KEYS[role]);
    }
  }, []);

  // Start tour
  const startTour = useCallback((role: TourRole) => {
    setCurrentRole(role);
    setStepIndex(0);
    setIsTourRunning(true);
  }, []);

  // Stop tour
  const stopTour = useCallback(() => {
    setIsTourRunning(false);
    setCurrentRole(null);
    setStepIndex(0);
  }, []);

  return (
    <TourContext.Provider
      value={{
        isTourRunning,
        currentRole,
        stepIndex,
        startTour,
        stopTour,
        setStepIndex,
        hasCompletedTour,
        markTourComplete,
        resetTourCompletion,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within TourProvider");
  }
  return context;
}
