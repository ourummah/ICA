import { CircleCheck, CircleDashed, CircleMinus, OctagonAlert, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/card";
import type { Database } from "@/lib/database.types";
import type { BoardColour } from "@/lib/supervisor/board";
import { EXCEPTION_LABELS } from "@/lib/supervisor/board";
import { cn } from "@/lib/utils";

type Enums = Database["public"]["Enums"];

export const colourStyles: Record<BoardColour, { tile: string; text: string; icon: typeof CircleCheck }> = {
  red: { tile: "border-status-red bg-status-red/10", text: "text-status-red", icon: OctagonAlert },
  amber: { tile: "border-status-amber bg-status-amber/10", text: "text-status-amber", icon: TriangleAlert },
  green: { tile: "border-status-green bg-status-green/10", text: "text-status-green", icon: CircleCheck },
  none: { tile: "border-border bg-muted", text: "text-muted-foreground", icon: CircleMinus },
};

/** Colour plus icon plus words, so colour is never the only signal (SPEC 10). */
export function BoardLabel({
  colour,
  label,
  className,
}: {
  colour: BoardColour;
  label: string;
  className?: string;
}) {
  const { text, icon: Icon } = colourStyles[colour];
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-semibold", text, className)}>
      <Icon className="size-5" aria-hidden />
      {label}
    </span>
  );
}

export const TASK_STATUS_LABELS: Record<Enums["task_status"], string> = {
  pending: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  reclean_required: "Sent back for re-clean",
  verified: "Verified",
};

export function TaskStatusBadge({ status }: { status: Enums["task_status"] }) {
  const tone =
    status === "completed" || status === "verified"
      ? "green"
      : status === "reclean_required"
        ? "red"
        : status === "in_progress"
          ? "amber"
          : "neutral";
  const Icon = tone === "green" ? CircleCheck : tone === "red" ? OctagonAlert : CircleDashed;
  return (
    <Badge tone={tone}>
      <Icon className="size-3.5" aria-hidden />
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ExceptionBadge({
  type,
  severity,
  status,
}: {
  type: Enums["exception_type"];
  severity: Enums["exception_severity"];
  status: Enums["exception_status"];
}) {
  if (status === "resolved")
    return (
      <Badge tone="neutral">
        <CircleCheck className="size-3.5" aria-hidden />
        {EXCEPTION_LABELS[type]} · resolved
      </Badge>
    );
  const Icon = severity === "red" ? OctagonAlert : TriangleAlert;
  return (
    <Badge tone={severity}>
      <Icon className="size-3.5" aria-hidden />
      {EXCEPTION_LABELS[type]} · {severity}
    </Badge>
  );
}
