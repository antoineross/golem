import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ClockIcon, DocumentTextIcon, TrashIcon } from "@heroicons/react/20/solid";
import type { TraceFile } from "@/types/trace";

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

const harnessColors: Record<string, string> = {
  level0: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  level1a: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  level1b: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  level2: "bg-red-500/15 text-red-400 border-red-500/20",
  agent: "bg-green-500/15 text-green-400 border-green-500/20",
  thinking: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  trace: "bg-muted text-muted-foreground border-border",
};

interface SidebarTraceItemProps {
  file: TraceFile;
  isSelected: boolean;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
}

export function SidebarTraceItem({
  file,
  isSelected,
  onSelect,
  onDelete,
}: SidebarTraceItemProps) {
  return (
    <div className="group relative">
      <Button
        variant="ghost"
        className={`w-full justify-start h-auto px-3 py-2 text-left rounded-md ${
          isSelected
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => onSelect(file.path)}
      >
        <div className="flex flex-col gap-1 w-full min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <DocumentTextIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="text-sm font-medium truncate">
              {file.display_name || file.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 pl-5">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-4 font-normal border ${harnessColors[file.harness] ?? harnessColors.trace}`}
            >
              {file.harness}
            </Badge>
            {file.has_events && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-normal text-green-400 border-green-500/20"
              >
                rich
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1 ml-auto shrink-0 cursor-default" />
                }
              >
                <ClockIcon className="h-3 w-3" />
                {relativeTime(file.modified)}
              </TooltipTrigger>
              <TooltipContent>
                {new Date(file.modified).toLocaleString()}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </Button>
      {onDelete && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-1.5 right-1.5 h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${file.display_name || file.name}"?`)) {
                    onDelete(file.path);
                  }
                }}
                aria-label="Delete trace"
              />
            }
          >
            <TrashIcon className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent>Delete this trace</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
