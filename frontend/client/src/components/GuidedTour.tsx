import Joyride, { CallBackProps, STATUS, EVENTS, ACTIONS } from "react-joyride";
import { useTour } from "@/contexts/TourContext";
import { getTourSteps } from "@/lib/tourSteps";
import { useCallback } from "react";

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
    borderRadius: "8px",
    fontSize: "14px",
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

      // Handle close button
      if (action === ACTIONS.CLOSE) {
        stopTour();
      }
    },
    [currentRole, markTourComplete, stopTour, setStepIndex]
  );

  if (!isTourRunning || !currentRole) {
    return null;
  }

  const steps = getTourSteps(currentRole);

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
