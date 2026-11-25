import type { Database } from "@/lib/database.types";

export type StepType = Database["public"]["Enums"]["step_type"];

export interface StepTypeInfo {
  label: string;
  /** lucide-react icon name used as the default for this step type. */
  icon: string;
}

export const STEP_TYPES: Record<StepType, StepTypeInfo> = {
  prepare_isolate: { label: "Prepare / isolate", icon: "lock" },
  dry_clean: { label: "Dry clean", icon: "brush" },
  pre_rinse: { label: "Pre-rinse", icon: "droplets" },
  foam: { label: "Foam", icon: "spray-can" },
  dwell: { label: "Dwell", icon: "timer" },
  scrub: { label: "Scrub", icon: "hand" },
  rinse: { label: "Rinse", icon: "shower-head" },
  inspect: { label: "Inspect", icon: "flashlight" },
  sanitise: { label: "Sanitise", icon: "shield-check" },
  atp_check: { label: "ATP check", icon: "test-tube" },
  reassemble: { label: "Reassemble", icon: "wrench" },
};

export const STEP_TYPE_VALUES = Object.keys(STEP_TYPES) as [StepType, ...StepType[]];
