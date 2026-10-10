// Builds the final video: each scene's frames are fitted to its narration,
// a role badge is drawn on app scenes, then everything is concatenated and
// the subtitles are burned in.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const FF = require("ffmpeg-static");
const DIR = "C:/Users/muham/gh-video";
process.chdir(DIR);
fs.mkdirSync("seg", { recursive: true });

const GAP = 0.45; // breathing room after each narration
const scenes = JSON.parse(fs.readFileSync("scenes.json", "utf8"));
const ROLE = (id) => {
  const n = Number(id.slice(1, 3));
  if (n >= 3 && n <= 8) return "CUSTOMER VIEW";
  if (n >= 9 && n <= 12) return "PROVIDER VIEW";
  if (n >= 13 && n <= 15) return "ADMIN VIEW";
  return null;
};
function wavSeconds(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  while (off < b.length) { const id = b.toString("ascii", off, off + 4); const size = b.readUInt32LE(off + 4); if (id === "data") return size / b.readUInt32LE(28); off += 8 + size; }
}
const ff = (args) => execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const FONT = "C\\:/Windows/Fonts/segoeuib.ttf";

let t = 0;
const srt = [];
let n = 1;
const fmt = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };

// Split narration into readable subtitle lines (≤ ~11 words, prefer clause breaks).
function chunks(text) {
  const out = [];
  for (const sentence of text.match(/[^.!?]+[.!?]+/g) || [text]) {
    const words = sentence.trim().split(/\s+/);
    let cur = [];
    for (const w of words) {
      cur.push(w);
      const breakHere = (cur.length >= 6 && /[,;:]$/.test(w)) || cur.length >= 11;
      if (breakHere) { out.push(cur.join(" ")); cur = []; }
    }
    if (cur.length) {
      if (cur.length <= 2 && out.length) out[out.length - 1] += " " + cur.join(" ");
      else out.push(cur.join(" "));
    }
  }
  return out;
}

const report = [];
for (const { id, text } of scenes) {
  const dur = wavSeconds(`audio/${id}.wav`);
  const total = dur + GAP;
  const list = fs.readFileSync(`clips/${id}/frames.txt`, "utf8");
  const clipLen = [...list.matchAll(/duration ([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0);
  // Speed up an over-long recording to fit (UI motion tolerates up to ~1.8x); never slow down.
  const speed = Math.min(1.8, Math.max(1, clipLen / total));
  const role = ROLE(id);
  const badge = role
    ? `,drawtext=fontfile='${FONT}':text='${role}':fontsize=17:fontcolor=white:box=1:boxcolor=0x0F6E5F@0.92:boxborderw=12:x=w-tw-36:y=96`
    : "";
  const isFirst = id === scenes[0].id, isLast = id === scenes.at(-1).id;
  const fades = `${isFirst ? ",fade=t=in:st=0:d=0.8" : ""}${isLast ? `,fade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2` : ""}`;
  const afade = isLast ? `,afade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6` : "";
  ff([
    "-f", "concat", "-safe", "0", "-i", `clips/${id}/frames.txt`,
    "-i", `audio/${id}.wav`,
    "-filter_complex",
    `[0:v]setpts=(PTS-STARTPTS)/${speed.toFixed(4)},fps=30,scale=1280:720:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=30,trim=duration=${total.toFixed(3)}${badge}${fades},format=yuv420p[v];` +
      `[1:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${total.toFixed(3)}${afade}[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-r", "30",
    "-c:a", "aac", "-b:a", "160k", `seg/${id}.mp4`,
  ]);
  report.push(`${id}: audio ${dur.toFixed(1)}s, clip ${clipLen.toFixed(1)}s, speed ${speed.toFixed(2)}x${clipLen / total > 1.8 ? " (trimmed)" : ""}`);

  // Subtitles timed across the narration in proportion to length.
  const parts = chunks(text);
  const chars = parts.reduce((s, p) => s + p.length, 0);
  let at = t + 0.15;
  for (const p of parts) {
    const len = (p.length / chars) * (dur - 0.2);
    srt.push(`${n++}\n${fmt(at)} --> ${fmt(at + len - 0.05)}\n${p}\n`);
    at += len;
  }
  t += total;
}
fs.writeFileSync("subs.srt", srt.join("\n"));
fs.writeFileSync("seg/list.txt", scenes.map(({ id }) => `file '${id}.mp4'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", "seg/list.txt", "-c", "copy", "full.mp4"]);
const style = "FontName=Segoe UI Semibold,FontSize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H8C18332F,BackColour=&H8C18332F,BorderStyle=3,Outline=7,Shadow=0,MarginV=22";
ff(["-i", "full.mp4", "-vf", `subtitles=subs.srt:force_style='${style}'`, "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-c:a", "copy", "-movflags", "+faststart", "goodhand-walkthrough.mp4"]);
console.log(report.join("\n"));
console.log(`total ${(t / 60).toFixed(2)} min`);
