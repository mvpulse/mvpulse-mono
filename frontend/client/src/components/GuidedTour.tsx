import Joyride, { CallBackProps, STATUS, EVENTS, ACTIONS, Step } from "react-joyride";
import { useTour } from "@/contexts/TourContext";
import { getTourSteps } from "@/lib/tourSteps";
import { useCallback, useMemo } from "react";

// Custom styles matching MVPulse theme
const joyrideStyles = {
  options: {
    arrowColor: "hsl(var(--card))",
    backgroundColor: "hsl(var(--card))",
    overlayColor: "rgba(0, 0, 0, 0.7)",
    primaryColor: "hsl(var(--primary))",
    textColor: "hsl(var(--foreground))",
    zIndex: 10000,
  },
  tooltip: {
    borderRadius: "12px",
    padding: "16px",
  },
  tooltipContainer: {
    textAlign: "left" as const,
  },
  tooltipTitle: {
    fontSize: "16px",
    fontWeight: 600,
  },
  tooltipContent: {
    fontSize: "14px",
    lineHeight: 1.5,
  },
  buttonNext: {
    backgroundColor: "hsl(var(--primary))",
    color: "#000000",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    padding: "8px 16px",
  },
  buttonBack: {
    color: "hsl(var(--muted-foreground))",
    marginRight: "8px",
  },
  buttonSkip: {
    color: "hsl(var(--muted-foreground))",
  },
  spotlight: {
    borderRadius: "12px",
  },
};

export function GuidedTour() {
  const {
    isTourRunning,
    currentRole,
    stepIndex,
    setStepIndex,
    stopTour,
    markTourComplete,
  } = useTour();

  const handleCallback = useCallback(
    (data: CallBackProps) => {
      const { status, type, action, index } = data;

      // Handle tour completion
      if (status === STATUS.FINISHED) {
        if (currentRole) {
          markTourComplete(currentRole);
        }
        stopTour();
        return;
      }

      // Handle skip
      if (status === STATUS.SKIPPED) {
        if (currentRole) {
          markTourComplete(currentRole);
        }
        stopTour();
        return;
      }

      // Handle step changes
      if (type === EVENTS.STEP_AFTER) {
        if (action === ACTIONS.NEXT) {
          setStepIndex(index + 1);
        } else if (action === ACTIONS.PREV) {
          setStepIndex(index - 1);
        }
      }

      // Handle target not found - skip to next step
      if (type === EVENTS.TARGET_NOT_FOUND) {
        setStepIndex(index + 1);
        return;
      }

      // Handle close button
      if (action === ACTIONS.CLOSE) {
        stopTour();
      }
    },
    [currentRole, markTourComplete, stopTour, setStepIndex]
  );

  // Filter steps to only include those with existing DOM targets
  const steps = useMemo(() => {
    if (!currentRole) return [];

    const allSteps = getTourSteps(currentRole);

    // Filter out steps whose targets don't exist in the DOM
    return allSteps.filter((step: Step) => {
      // Center placement steps (welcome) don't need a specific target
      if (step.placement === "center") return true;

      // Check if target element exists
      const target = step.target;
      if (typeof target === "string") {
        const element = document.querySelector(target);
        return element !== null;
      }
      return true;
    });
  }, [currentRole, isTourRunning]); // Re-filter when tour starts

  if (!isTourRunning || !currentRole || steps.length === 0) {
    return null;
  }

  return (
    <Joyride
      steps={steps}
      run={isTourRunning}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      disableOverlayClose
      spotlightClicks={false}
      callback={handleCallback}
      styles={joyrideStyles}
      locale={{
        back: "Back",
        close: "Close",
        last: "Finish",
        next: "Next",
        skip: "Skip Tour",
      }}
      floaterProps={{
        disableAnimation: false,
      }}
    />
  );
}
