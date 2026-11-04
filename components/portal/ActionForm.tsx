"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle } from "lucide-react";

type State = { error?: string; ok?: string } | undefined;

/** A form bound to a server action that returns { error } to show inline. */
export function ActionForm({ action, children, className }: { action: (s: State, fd: FormData) => Promise<State>; children: ReactNode; className?: string }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className={className}>
      {state?.error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <span>{state.error}</span>
        </div>
      )}
      {children}
    </form>
  );
}

export function SubmitButton({ children, className, pending: pendingText }: { children: ReactNode; className: string; pending?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText || "Please wait…" : children}
    </button>
  );
}
