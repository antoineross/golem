import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageIcon } from "lucide-react";

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

export function ScreenshotGallery() {
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/screenshots`)
      .then((r) => r.json())
      .then((data) => {
        setScreenshots(data.screenshots ?? []);
        setLoading(false);
      })
      .catch((e) => {
        console.warn("failed to fetch screenshots:", e);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (screenshots.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No screenshots found.</p>
          <p className="text-xs mt-1">Run the agent with screenshot tool to capture images.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {screenshots.map((name) => (
        <Card key={name} className="overflow-hidden">
          <img
            src={`${API_BASE}/api/screenshots/${name}`}
            alt={name}
            className="w-full h-48 object-cover"
            loading="lazy"
          />
          <CardContent className="p-2">
            <span className="text-xs text-muted-foreground truncate block">{name}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
