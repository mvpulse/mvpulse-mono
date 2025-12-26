/**
 * DurationInput - Unified duration input component
 *
 * Supports two modes:
 * - "fixed": Predefined duration options (1h, 24h, 3d, 1w)
 * - "custom": Custom start and end datetime inputs with 15-minute steps
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DurationKey, DurationMode } from "@/hooks/useDurationInput";

export interface DurationInputProps {
  mode: DurationMode;
  onModeChange: (mode: DurationMode) => void;

  // Fixed mode
  fixedDuration: DurationKey;
  onFixedDurationChange: (duration: DurationKey) => void;

  // Custom mode
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;

  /** Use compact layout */
  compact?: boolean;
  className?: string;
  /** Label for the input group (optional) */
  label?: string;
}

export function DurationInput({
  mode,
  onModeChange,
  fixedDuration,
  onFixedDurationChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  compact = false,
  className,
  label,
}: DurationInputProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {label && <Label>{label}</Label>}

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "fixed" ? "default" : "outline"}
          size="sm"
          onClick={() => onModeChange("fixed")}
          className="flex-1 gap-1.5"
        >
          <Clock className="w-3.5 h-3.5" />
          <span className={cn(compact && "text-xs")}>Fixed Duration</span>
        </Button>
        <Button
          type="button"
          variant={mode === "custom" ? "default" : "outline"}
          size="sm"
          onClick={() => onModeChange("custom")}
          className="flex-1 gap-1.5"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span className={cn(compact && "text-xs")}>Custom Dates</span>
        </Button>
      </div>

      {/* Fixed Duration Mode */}
      {mode === "fixed" && (
        <Select
          value={fixedDuration}
          onValueChange={(v) => onFixedDurationChange(v as DurationKey)}
        >
          <SelectTrigger className="bg-muted/30">
            <SelectValue placeholder="Select duration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">1 Hour</SelectItem>
            <SelectItem value="24h">24 Hours</SelectItem>
            <SelectItem value="3d">3 Days</SelectItem>
            <SelectItem value="1w">1 Week</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Custom Dates Mode */}
      {mode === "custom" && (
        <div className={cn("grid gap-4", compact ? "grid-cols-1" : "grid-cols-2")}>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Start Date</Label>
            <Input
              type="datetime-local"
              step="900"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="bg-muted/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">End Date</Label>
            <Input
              type="datetime-local"
              step="900"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="bg-muted/30"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default DurationInput;
