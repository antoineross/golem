import type { TraceFile } from "@/types/trace";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

interface TracePickerProps {
  files: TraceFile[];
  selected: string | null;
  onSelect: (path: string) => void;
}

export function TracePicker({ files, selected, onSelect }: TracePickerProps) {
  if (files.length === 0) {
    return <div className="text-xs text-zinc-500">No trace files found</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <button
          key={f.path}
          onClick={() => onSelect(f.path)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-colors ${
            selected === f.path
              ? "bg-zinc-700 text-zinc-100"
              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          }`}
        >
          <FileText className="h-3 w-3" />
          <span className="truncate max-w-[140px]">{f.name}</span>
          <Badge variant="outline" className="text-[10px] border-zinc-700 px-1">
            {new Date(f.modified).toLocaleDateString()}
          </Badge>
        </button>
      ))}
    </div>
  );
}
