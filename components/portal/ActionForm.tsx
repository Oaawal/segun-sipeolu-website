"use client";

import { createContext, startTransition, useActionState, useContext, type FormEvent, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type State = { error?: string; ok?: string } | undefined;

const Pending = createContext(false);

/**
 * A form bound to a server action that returns { error } to show inline.
 * Submitting through a transition (rather than the form's action prop) keeps
 * what the person typed when the action reports an error, so they only fix
 * the field that was wrong instead of filling the whole form in again.
 */
export function ActionForm({ action, children, className }: { action: (s: State, fd: FormData) => Promise<State>; children: ReactNode; className?: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => run(fd));
  }
  return (
    <form onSubmit={submit} className={className}>
      {state?.error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <span>{state.error}</span>
        </div>
      )}
      <Pending.Provider value={pending}>{children}</Pending.Provider>
    </form>
  );
}

export function SubmitButton({ children, className, pending: pendingText }: { children: ReactNode; className: string; pending?: string }) {
  const pending = useContext(Pending);
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText || "Please wait…" : children}
    </button>
  );
}
