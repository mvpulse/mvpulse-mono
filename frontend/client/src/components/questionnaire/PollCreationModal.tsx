/**
 * PollCreationModal - Dialog wrapper for creating polls within questionnaire flow
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PollCreationForm, PollFormData } from "@/components/poll";

interface PollCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPollCreated: (data: PollFormData) => void;
  /** Whether incentives should be shown (false if questionnaire has shared rewards) */
  showIncentives?: boolean;
  /** Inherited category from parent questionnaire (hides category field) */
  inheritedCategory?: string;
  /** Inherited duration in seconds from parent questionnaire (hides duration field) */
  inheritedDurationSecs?: number;
}

export function PollCreationModal({
  open,
  onOpenChange,
  onPollCreated,
  showIncentives = false,
  inheritedCategory,
  inheritedDurationSecs,
}: PollCreationModalProps) {
  const handleSubmit = (data: PollFormData) => {
    onPollCreated(data);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Poll</DialogTitle>
          <DialogDescription>
            Create a poll to add to your questionnaire. Polls created here will be
            submitted together with the questionnaire.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <PollCreationForm
            mode="embedded"
            compact
            showIncentives={showIncentives}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitButtonText="Add Poll"
            inheritedCategory={inheritedCategory}
            inheritedDurationSecs={inheritedDurationSecs}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PollCreationModal;
