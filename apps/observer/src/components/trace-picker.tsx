import type { TraceFile } from "@/types/trace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { FileText } from "lucide-react";

interface TracePickerProps {
  files: TraceFile[];
  selected: string | null;
  onSelect: (path: string) => void;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TracePicker({ files, selected, onSelect }: TracePickerProps) {
  if (files.length === 0) {
    return <div className="text-xs text-muted-foreground">No trace files found</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <Tooltip key={f.path}>
          <TooltipTrigger
            render={
              <Button
                variant={selected === f.path ? "secondary" : "outline"}
                size="sm"
                onClick={() => onSelect(f.path)}
              />
            }
          >
            <FileText className="h-3 w-3" />
            <span className="truncate max-w-[140px]">{f.name}</span>
            <Badge variant="outline" className="text-[10px] px-1 ml-1">
              {relativeTime(f.modified)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{new Date(f.modified).toLocaleString()}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
