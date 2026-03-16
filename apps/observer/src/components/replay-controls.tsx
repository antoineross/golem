import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw } from "lucide-react";
import type { TimelineEvent } from "@/types/trace";

interface ReplayControlsProps {
  events: TimelineEvent[];
  onVisibleEvents: (events: TimelineEvent[]) => void;
}

const SPEED_OPTIONS = [1, 2, 5, 10] as const;

export function ReplayControls({ events, onVisibleEvents }: ReplayControlsProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalEvents = events.length;

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
  }, []);

  const tick = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= totalEvents) {
        stop();
        return totalEvents;
      }
      return next;
    });
  }, [totalEvents, stop]);

  useEffect(() => {
    onVisibleEvents(events.slice(0, currentIndex));
  }, [currentIndex, events, onVisibleEvents]);

  const play = useCallback(() => {
    if (currentIndex >= totalEvents) {
      setCurrentIndex(0);
    }
    setPlaying(true);
    const interval = Math.max(100, 1000 / speed);
    timerRef.current = setInterval(tick, interval);
  }, [currentIndex, totalEvents, speed, tick]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const prevSpeedRef = useRef(speed);
  useEffect(() => {
    if (prevSpeedRef.current !== speed && playing) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const interval = Math.max(100, 1000 / speed);
      timerRef.current = setInterval(tick, interval);
    }
    prevSpeedRef.current = speed;
  }, [speed, playing, tick]);

  const reset = () => {
    stop();
    setCurrentIndex(0);
  };

  const togglePlay = () => {
    if (playing) {
      stop();
    } else {
      play();
    }
  };

  const progress = totalEvents > 0 ? (currentIndex / totalEvents) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={togglePlay}
        className="text-xs border-zinc-700 hover:bg-zinc-800"
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={reset}
        className="text-xs border-zinc-700 hover:bg-zinc-800"
      >
        <RotateCcw className="h-3 w-3" />
      </Button>

      <div className="flex gap-1">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              speed === s
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
        {currentIndex}/{totalEvents}
      </Badge>
    </div>
  );
}
