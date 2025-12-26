/**
 * InlinePollCreator - Collapsible inline form for creating polls within questionnaire flow
 */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PollCreationForm, PollFormData } from "@/components/poll";
import { Plus } from "lucide-react";
import { useState } from "react";

interface InlinePollCreatorProps {
  onPollCreated: (data: PollFormData) => void;
  /** Whether incentives should be shown (false if questionnaire has shared rewards) */
  showIncentives?: boolean;
  /** Controlled open state */
  defaultOpen?: boolean;
  /** Inherited category from parent questionnaire (hides category field) */
  inheritedCategory?: string;
  /** Inherited duration in seconds from parent questionnaire (hides duration field) */
  inheritedDurationSecs?: number;
}

export function InlinePollCreator({
  onPollCreated,
  showIncentives = false,
  defaultOpen = false,
  inheritedCategory,
  inheritedDurationSecs,
}: InlinePollCreatorProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen ? "create-poll" : "");

  const handleSubmit = (data: PollFormData) => {
    onPollCreated(data);
    // Collapse the accordion after creating
    setIsOpen("");
  };

  const handleCancel = () => {
    setIsOpen("");
  };

  return (
    <Accordion
      type="single"
      collapsible
      value={isOpen}
      onValueChange={setIsOpen}
      className="border rounded-lg"
    >
      <AccordionItem value="create-poll" className="border-0">
        <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plus className="w-4 h-4" />
            Create New Poll
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <div className="pt-2">
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
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export default InlinePollCreator;
