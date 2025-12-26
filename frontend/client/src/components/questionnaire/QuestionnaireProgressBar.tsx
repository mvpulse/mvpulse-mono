import { Progress } from "@/components/ui/progress";
import { CheckCircle2 } from "lucide-react";

interface QuestionnaireProgressBarProps {
  totalPolls: number;
  answeredPolls: number;
  isComplete: boolean;
}

export function QuestionnaireProgressBar({
  totalPolls,
  answeredPolls,
  isComplete,
}: QuestionnaireProgressBarProps) {
  const percentage = totalPolls > 0 ? Math.round((answeredPolls / totalPolls) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Progress</span>
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {answeredPolls} / {totalPolls} polls
          </span>
          {isComplete && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
        </div>
      </div>
      <Progress value={percentage} className="h-2" />
      {isComplete && (
        <p className="text-sm text-green-600 dark:text-green-400 text-center">
          Questionnaire complete!
        </p>
      )}
    </div>
  );
}
