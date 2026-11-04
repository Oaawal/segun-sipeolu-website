"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Pause, Play, Square, Upload, Loader2 } from "lucide-react";

/**
 * Records a meeting in the browser (phone or laptop microphone) and uploads
 * it for transcription. Audio stays in memory until uploaded; nothing is
 * saved on the device.
 */
export function Recorder({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "recording" | "paused" | "uploading" | "error">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => () => stopAll(), []);

  function stopAll() {
    if (timer.current) clearInterval(timer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
  }

  async function start() {
    setError("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const r = new MediaRecorder(s, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.start(5000);
      rec.current = r;
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((x) => (rec.current?.state === "recording" ? x + 1 : x)), 1000);
      // Input level meter, so people can see the microphone is picking them up
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(s).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      setState("recording");
    } catch {
      setError("The microphone could not be used. Allow microphone access for this site and try again.");
      setState("error");
    }
  }

  function pause() {
    if (rec.current?.state === "recording") { rec.current.pause(); setState("paused"); }
    else if (rec.current?.state === "paused") { rec.current.resume(); setState("recording"); }
  }

  async function finish() {
    const r = rec.current;
    if (!r) return;
    await new Promise<void>((res) => { r.onstop = () => res(); r.stop(); });
    stopAll();
    const type = r.mimeType || "audio/webm";
    const blob = new Blob(chunks.current, { type });
    await upload(new File([blob], `recording-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${type.includes("mp4") ? "m4a" : "webm"}`, { type }));
  }

  async function upload(file: File) {
    setState("uploading");
    const fd = new FormData();
    fd.append("audio", file);
    const res = await fetch(`/portal/api/meetings/${meetingId}/audio`, { method: "POST", body: fd, headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "The recording could not be uploaded. Try again.");
      setState("error");
      return;
    }
    router.replace(`/portal/meetings/${meetingId}?msg=processing`);
    router.refresh();
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-maroon-dark to-maroon p-5 text-white">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative grid h-16 w-16 flex-none place-items-center rounded-full bg-white/10">
          <span className="absolute inset-0 rounded-full bg-gold/40 transition-transform" style={{ transform: `scale(${state === "recording" ? 1 + level * 0.5 : 1})`, opacity: state === "recording" ? 0.6 : 0 }} />
          <Mic className="relative h-7 w-7 text-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-3xl font-semibold tabular-nums">{mm}:{ss}</div>
          <div className="text-sm text-white/70">
            {state === "idle" && "Ready to record. Put the phone or laptop in the middle of the table."}
            {state === "recording" && "Recording…"}
            {state === "paused" && "Paused"}
            {state === "uploading" && "Uploading securely…"}
            {state === "error" && <span className="text-gold">{error}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(state === "idle" || state === "error") && (
            <button onClick={start} className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-maroon-dark hover:brightness-95"><Mic className="h-4 w-4" />Start recording</button>
          )}
          {(state === "recording" || state === "paused") && (
            <>
              <button onClick={pause} className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/25">{state === "paused" ? <><Play className="h-4 w-4" />Resume</> : <><Pause className="h-4 w-4" />Pause</>}</button>
              <button onClick={finish} className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-maroon-dark hover:brightness-95"><Square className="h-4 w-4" />Stop and transcribe</button>
            </>
          )}
          {state === "uploading" && <span className="inline-flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Please keep this page open</span>}
        </div>
      </div>
      {(state === "idle" || state === "error") && (
        <label className="mt-4 flex cursor-pointer items-center gap-2 border-t border-white/10 pt-4 text-sm text-white/80 hover:text-white">
          <Upload className="h-4 w-4" />
          <span>Or upload a recording (MP3, M4A, WAV, WEBM, OGG)</span>
          <input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac,.mp4" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      )}
    </div>
  );
}
