import { Suspense } from "react";

import { LoginForm } from "./login-form";

async function NextAwareForm({ searchParams }: { searchParams: PageProps<"/app/login">["searchParams"] }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <>
      {params.reset ? (
        <p role="status" className="rounded-md bg-status-green/10 px-3 py-2 text-sm">
          The demo was reset. Sign in again; phones need to be registered again too.
        </p>
      ) : null}
      <LoginForm next={next} />
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/app/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Intelligent Cleaning Audit
        </p>
        <h1 className="text-2xl font-bold text-primary">Staff sign-in</h1>
        <p className="text-sm text-muted-foreground">
          Supervisors, QA and site admins. Cleaners sign in on a shared device.
        </p>
      </div>
      <Suspense>
        <NextAwareForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
