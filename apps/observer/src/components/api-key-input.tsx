import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { KeyIcon, XMarkIcon, CheckIcon } from "@heroicons/react/20/solid";

const STORAGE_KEY = "golem_api_key";

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function useApiKey() {
  const [apiKey, setApiKey] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  const save = (key: string) => {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
      setApiKey(trimmed);
    }
  };

  const clear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
  };

  return { apiKey, save, clear };
}

interface ApiKeyInputProps {
  apiKey: string | null;
  onSave: (key: string) => void;
  onClear: () => void;
}

export function ApiKeyInput({ apiKey, onSave, onClear }: ApiKeyInputProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSave = () => {
    if (draft.trim()) {
      onSave(draft);
      setDraft("");
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={apiKey ? "secondary" : "outline"}
              size="sm"
              onClick={() => setOpen(!open)}
              aria-label="API key settings"
            />
          }
        >
          <KeyIcon className={`h-3.5 w-3.5 ${apiKey ? "text-green-400" : ""}`} />
          {apiKey ? (
            <span className="text-xs font-mono">{maskKey(apiKey)}</span>
          ) : (
            <span className="text-xs">API Key</span>
          )}
        </TooltipTrigger>
        <TooltipContent>
          {apiKey
            ? "Custom Gemini API key active. Click to manage."
            : "Provide your own Gemini API key to avoid rate limits"}
        </TooltipContent>
      </Tooltip>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-md border border-border bg-popover p-3 shadow-lg z-50">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                Gemini API Key
              </span>
              {apiKey && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <CheckIcon className="h-2.5 w-2.5 text-green-400" />
                  Active
                </Badge>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Provide your own{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-foreground"
              >
                Google AI Studio
              </a>{" "}
              API key. Stored in your browser only -- never sent to any
              external server.
            </p>

            {apiKey ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded bg-muted px-2.5 py-1.5 text-xs font-mono text-muted-foreground">
                  {maskKey(apiKey)}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { onClear(); setOpen(false); }}
                  className="h-7 px-2"
                >
                  <XMarkIcon className="h-3 w-3 mr-1" />
                  Remove
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Input
                  type="password"
                  placeholder="AIzaSy..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="text-xs h-7 font-mono"
                  autoFocus
                />
                <Button
                  variant="default"
                  size="sm"
                  disabled={!draft.trim()}
                  onClick={handleSave}
                  className="h-7 px-3 shrink-0"
                >
                  Save
                </Button>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Key is used for agent runs triggered from this dashboard.
              The default server key is used when no custom key is set.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
