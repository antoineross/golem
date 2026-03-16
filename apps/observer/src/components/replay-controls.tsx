import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { PlayIcon, PauseIcon, ArrowPathIcon } from "@heroicons/react/20/solid";
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
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              onClick={togglePlay}
              aria-label={playing ? "Pause replay" : "Play replay"}
            />
          }
        >
          {playing ? <PauseIcon className="h-3 w-3" /> : <PlayIcon className="h-3 w-3" />}
        </TooltipTrigger>
        <TooltipContent>{playing ? "Pause" : "Play"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              onClick={reset}
              aria-label="Reset replay"
            />
          }
        >
          <ArrowPathIcon className="h-3 w-3" />
        </TooltipTrigger>
        <TooltipContent>Reset to start</TooltipContent>
      </Tooltip>

      <ToggleGroup
        value={[String(speed)]}
        onValueChange={(val) => {
          if (val.length > 0) setSpeed(Number(val[val.length - 1]));
        }}
        variant="outline"
        size="sm"
      >
        {SPEED_OPTIONS.map((s) => (
          <ToggleGroupItem key={s} value={String(s)} aria-label={`${s}x speed`}>
            {s}x
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex-1">
        <Progress value={progress} />
      </div>

      <Badge variant="outline" className="text-[10px] tabular-nums">
        {currentIndex}/{totalEvents}
      </Badge>
    </div>
  );
}
