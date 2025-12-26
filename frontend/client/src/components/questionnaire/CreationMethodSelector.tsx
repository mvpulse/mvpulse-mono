/**
 * CreationMethodSelector - Toggle between poll creation methods
 * Persists user preference in localStorage
 */

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SquareStack, Layers, LayoutGrid } from "lucide-react";
import { useEffect, useState } from "react";

export type CreationMethod = "modal" | "inline" | "tab";

const STORAGE_KEY = "poll-creation-method";

interface CreationMethodSelectorProps {
  value: CreationMethod;
  onChange: (method: CreationMethod) => void;
  className?: string;
}

export function CreationMethodSelector({
  value,
  onChange,
  className,
}: CreationMethodSelectorProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as CreationMethod)}
      className={className}
    >
      <ToggleGroupItem value="modal" aria-label="Modal" className="gap-1.5 px-3">
        <SquareStack className="w-4 h-4" />
        <span className="text-xs">Modal</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="inline" aria-label="Inline" className="gap-1.5 px-3">
        <Layers className="w-4 h-4" />
        <span className="text-xs">Inline</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="tab" aria-label="Tab" className="gap-1.5 px-3">
        <LayoutGrid className="w-4 h-4" />
        <span className="text-xs">Tab</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/**
 * Hook to persist creation method preference
 */
export function useCreationMethodPreference() {
  const [method, setMethod] = useState<CreationMethod>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "modal" || stored === "inline" || stored === "tab") {
        return stored;
      }
    }
    return "tab"; // Default to tab-based UI
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, method);
  }, [method]);

  return [method, setMethod] as const;
}

export default CreationMethodSelector;
