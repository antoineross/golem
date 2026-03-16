import {
  GlobeIcon,
  CameraIcon,
  MousePointerClickIcon,
  EyeIcon,
  TerminalIcon,
  ShieldIcon,
  WrenchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ToolDisplayConfig {
  icon: LucideIcon;
  color: string;
  label: string;
  keyParams: string[];
  defaultOpen: boolean;
}

const toolConfigs: Record<string, ToolDisplayConfig> = {
  browse: {
    icon: GlobeIcon,
    color: "text-blue-400",
    label: "Browse",
    keyParams: ["url"],
    defaultOpen: false,
  },
  screenshot: {
    icon: CameraIcon,
    color: "text-amber-400",
    label: "Screenshot",
    keyParams: ["url"],
    defaultOpen: true,
  },
  click: {
    icon: MousePointerClickIcon,
    color: "text-green-400",
    label: "Click",
    keyParams: ["url", "selector"],
    defaultOpen: false,
  },
  find_hidden: {
    icon: EyeIcon,
    color: "text-purple-400",
    label: "Find Hidden",
    keyParams: ["url"],
    defaultOpen: false,
  },
  echo: {
    icon: TerminalIcon,
    color: "text-cyan-400",
    label: "Echo",
    keyParams: ["message"],
    defaultOpen: false,
  },
  payload: {
    icon: ShieldIcon,
    color: "text-red-400",
    label: "Payload",
    keyParams: ["category"],
    defaultOpen: false,
  },
};

const defaultConfig: ToolDisplayConfig = {
  icon: WrenchIcon,
  color: "text-muted-foreground",
  label: "Tool",
  keyParams: [],
  defaultOpen: false,
};

export function getToolConfig(name: string): ToolDisplayConfig {
  return toolConfigs[name] ?? defaultConfig;
}

export function filterKeyParams(
  args: Record<string, unknown>,
  keyParams: string[]
): Record<string, unknown> {
  if (keyParams.length === 0) return args;
  const filtered: Record<string, unknown> = {};
  for (const key of keyParams) {
    if (key in args) filtered[key] = args[key];
  }
  return Object.keys(filtered).length > 0 ? filtered : args;
}
