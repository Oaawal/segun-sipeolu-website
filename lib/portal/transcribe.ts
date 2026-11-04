import "server-only";

/**
 * Speech-to-text for meeting recordings.
 *
 * Claude reads and summarises text but does not transcribe audio, so the
 * recording goes to a speech-to-text service first. Deepgram is used here
 * (accurate on Nigerian English, labels who is speaking). Set
 * DEEPGRAM_API_KEY to switch it on. To use another provider, replace
 * transcribeAudio(); nothing else depends on it.
 *
 * Recordings contain privileged client information: confirm the provider's
 * data-processing terms (no training on your audio, deletion after
 * processing) before turning this on. See docs/portal/HANDOVER.md.
 */

export function transcriptionEnabled() {
  return !!process.env.DEEPGRAM_API_KEY;
}

interface Utterance { speaker?: number; start: number; transcript: string }

function stamp(sec: number) {
  const s = Math.floor(sec);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

export async function transcribeAudio(audio: Buffer, mimeType: string): Promise<string> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("Transcription is not set up (DEEPGRAM_API_KEY).");
  const params = new URLSearchParams({
    model: process.env.DEEPGRAM_MODEL || "nova-3",
    smart_format: "true", punctuate: "true", diarize: "true", utterances: "true", paragraphs: "true",
    language: process.env.DEEPGRAM_LANGUAGE || "en",
  });
  const res = await fetch(`${process.env.DEEPGRAM_API_BASE || "https://api.deepgram.com"}/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": mimeType || "application/octet-stream" },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok) throw new Error(`Transcription service error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { results?: { utterances?: Utterance[]; channels?: { alternatives?: { transcript?: string }[] }[] } };
  const utterances = data.results?.utterances || [];
  if (utterances.length) {
    // Merge consecutive lines from the same speaker into one paragraph
    const lines: string[] = [];
    let last: number | undefined = -1;
    for (const u of utterances) {
      const text = u.transcript.trim();
      if (!text) continue;
      if (u.speaker === last && lines.length) lines[lines.length - 1] += ` ${text}`;
      else lines.push(`[${stamp(u.start)}] Speaker ${(u.speaker ?? 0) + 1}: ${text}`);
      last = u.speaker;
    }
    return lines.join("\n\n");
  }
  const plain = data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
  if (!plain) throw new Error("No speech was found in the recording.");
  return plain;
}

/** Turn a WebVTT / SRT caption file (Zoom, Teams, Google Meet exports) into plain transcript text. */
export function captionsToText(raw: string): string {
  const lines = raw.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let lastSpeaker = "";
  for (const line of lines) {
    const l = line.trim();
    if (!l || l === "WEBVTT" || /^\d+$/.test(l) || /-->/.test(l) || /^NOTE\b/.test(l)) continue;
    // Teams/Zoom put "<v Name>text</v>" or "Name: text"
    const v = /^<v ([^>]+)>(.*?)(<\/v>)?$/.exec(l);
    const text = v ? `${v[1]}: ${v[2]}` : l.replace(/<[^>]+>/g, "");
    const speaker = /^([^:]{2,40}):\s/.exec(text)?.[1] || "";
    if (speaker && speaker === lastSpeaker && out.length) out[out.length - 1] += ` ${text.slice(speaker.length + 1).trim()}`;
    else out.push(text);
    if (speaker) lastSpeaker = speaker;
  }
  return out.join("\n\n");
}
