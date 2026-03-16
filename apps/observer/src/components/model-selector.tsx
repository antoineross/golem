import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STORAGE_KEY = "golem_model";

const MODELS = [
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash", tier: "fast" },
  { value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite", tier: "fast" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro", tier: "pro" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", tier: "pro" },
] as const;

const DEFAULT_MODEL = MODELS[0].value;

export function useModel() {
  const [model, setModel] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MODEL,
  );

  const save = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setModel(trimmed);
  };

  return { model, save };
}

interface ModelSelectorProps {
  model: string;
  onSelect: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ model, onSelect, disabled }: ModelSelectorProps) {
  const selected = MODELS.find((m) => m.value === model);
  const label = selected?.label ?? model;

  return (
    <Select value={model} onValueChange={onSelect} disabled={disabled}>
      <SelectTrigger size="sm" className="text-xs h-7 gap-1 min-w-[120px]" title="Select Gemini model for agent runs">
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {MODELS.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            <span className="text-xs">{m.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
