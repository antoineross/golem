import { useState, useEffect } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
    localStorage.setItem(STORAGE_KEY, value);
    setModel(value);
  };

  return { model, save };
}

interface ModelSelectorProps {
  model: string;
  onSelect: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ model, onSelect, disabled }: ModelSelectorProps) {
  const [value, setValue] = useState(model);

  useEffect(() => { setValue(model); }, [model]);

  const selected = MODELS.find((m) => m.value === value);
  const label = selected?.label ?? value;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="inline-flex">
            <Select
              value={value}
              onValueChange={(val: string) => {
                setValue(val);
                onSelect(val);
              }}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="text-xs h-7 gap-1 min-w-[120px]">
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
          </div>
        }
      />
      <TooltipContent>Select Gemini model for agent runs</TooltipContent>
    </Tooltip>
  );
}
