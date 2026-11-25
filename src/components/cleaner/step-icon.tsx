import {
  Brush,
  Droplets,
  Flashlight,
  Hand,
  Lock,
  ShieldCheck,
  ShowerHead,
  SprayCan,
  TestTube,
  Timer,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  lock: Lock,
  brush: Brush,
  droplets: Droplets,
  "spray-can": SprayCan,
  timer: Timer,
  hand: Hand,
  "shower-head": ShowerHead,
  flashlight: Flashlight,
  "shield-check": ShieldCheck,
  "test-tube": TestTube,
  wrench: Wrench,
};

export function StepIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && icons[name]) || Wrench;
  return <Icon className={className} aria-hidden />;
}
