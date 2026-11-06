"use client";

import { useEffect, useRef, useState } from "react";
import { stageFile } from "@/lib/portal/stage-client";

/**
 * A file input for ordinary forms. When the portal stores files in R2 (on
 * Vercel), submitting the form first sends the chosen files straight to
 * storage and replaces them with references, so large files are never
 * refused. Otherwise it is a plain file input.
 */
export function FileField({ name, direct, required = false, multiple, accept, className }: { name: string; direct: boolean; required?: boolean; multiple?: boolean; accept?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const el = input.current;
    const form = el?.form;
    if (!direct || !el || !form) return;
    async function onSubmit(e: SubmitEvent) {
      if (!el || !form || !el.files?.length || form.dataset.staged === "1") return;
      e.preventDefault();
      // Keep forms handled by React (inline errors) from submitting the raw files meanwhile
      e.stopImmediatePropagation();
      const files = Array.from(el.files);
      try {
        for (const [i, f] of files.entries()) {
          const ref = await stageFile(f, (p) => setStatus(`Uploading ${files.length > 1 ? `${i + 1} of ${files.length} ` : ""}… ${p}%`));
          const h = document.createElement("input");
          h.type = "hidden"; h.name = `${name}__staged`; h.value = JSON.stringify(ref);
          form.appendChild(h);
        }
        el.removeAttribute("name"); // the bytes are in storage already
        el.required = false;
        form.dataset.staged = "1";
        setStatus("Saving…");
        form.requestSubmit();
        // The form's data has been read; put the field back for a possible next attempt
        form.querySelectorAll(`input[type=hidden][name="${name}__staged"]`).forEach((h) => h.remove());
        el.setAttribute("name", name);
        el.value = "";
        el.required = !!required;
        delete form.dataset.staged;
      } catch (err) {
        setStatus((err as Error).message);
      }
    }
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [direct, name, required]);

  return (
    <>
      <input ref={input} type="file" name={name} required={required} multiple={multiple} accept={accept} className={className} />
      {status && <span className="mt-1 block text-xs text-stone-600" role="status">{status}</span>}
    </>
  );
}
