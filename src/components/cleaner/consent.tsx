"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function ConsentNotice({ onAccept }: { onAccept: () => void }) {
  const t = useTranslations("consent");
  return (
    <section className="flex flex-col gap-6 p-4">
      <ShieldCheck className="size-16 text-accent" aria-hidden />
      <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
      <p className="text-xl leading-relaxed">{t("body")}</p>
      <Button size="cleaner" variant="accent" onClick={onAccept}>
        {t("accept")}
      </Button>
    </section>
  );
}
