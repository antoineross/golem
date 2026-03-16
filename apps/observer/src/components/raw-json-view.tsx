import { ScrollArea } from "@/components/ui/scroll-area";

interface RawJsonViewProps {
  raw: string | null;
}

export function RawJsonView({ raw }: RawJsonViewProps) {
  if (!raw) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No raw data loaded.
      </div>
    );
  }

  let formatted = raw;
  try {
    const parsed = JSON.parse(raw);
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    // OTel spans are concatenated objects, not a valid JSON array -- display as-is
    formatted = raw;
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <pre className="text-xs text-muted-foreground bg-muted rounded p-4 font-mono whitespace-pre-wrap">
        {formatted}
      </pre>
    </ScrollArea>
  );
}
