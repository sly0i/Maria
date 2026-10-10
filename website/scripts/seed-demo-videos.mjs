#!/usr/bin/env node
/**
 * Rebuild local demo MP4s + JPEG thumbs so the gallery looks populated.
 * Run from website/: node scripts/seed-demo-videos.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const storePath = path.join(root, "data", "store.json");
const vidsDir = path.join(root, "uploads", "videos");
const thumbsDir = path.join(root, "uploads", "thumbs");

fs.mkdirSync(vidsDir, { recursive: true });
fs.mkdirSync(thumbsDir, { recursive: true });

const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const palettes = [
  ["#2a0614", "#ff2255", "#0a0006"],
  ["#1a0820", "#ff6fa0", "#12040c"],
  ["#301008", "#e30030", "#0c0206"],
  ["#180820", "#ff0844", "#0a0008"],
  ["#241018", "#ff4d7a", "#100408"],
  ["#1c0c18", "#ff2255", "#080006"],
  ["#28120c", "#ff6a3d", "#0a0404"],
  ["#200816", "#e30030", "#0c0006"],
  ["#160c20", "#ff5080", "#08040c"],
  ["#2c0818", "#ff2255", "#0a0006"],
  ["#1a1018", "#ff6fa0", "#0c0608"],
  ["#240c10", "#ff0844", "#0a0204"],
  ["#180c14", "#e34060", "#080006"],
  ["#2a1018", "#ff3d6e", "#0c0408"],
  ["#1c0814", "#ff2255", "#0a0006"],
  ["#201018", "#ff6fa0", "#100608"],
  ["#280c14", "#e30030", "#0a0206"],
  ["#160818", "#ff4d88", "#080006"],
];

function esc(s) {
  return String(s).replace(/:/g, "\\:").replace(/'/g, "");
}

for (const [i, video] of (store.videos || []).entries()) {
  const [c1, c2, c3] = palettes[i % palettes.length];
  const title = esc(video.title || "Clip");
  const out = path.join(vidsDir, video.filename);
  const thumb = path.join(thumbsDir, `${video.id}.jpg`);
  const filter = [
    `drawbox=y=ih*0.55:h=ih*0.45:color=${c3}@0.55:t=fill`,
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${title}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=h*0.72:shadowcolor=black@0.6:shadowx=2:shadowy=2`,
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='EROTICX':fontsize=18:fontcolor=${c2}:x=(w-text_w)/2:y=h*0.82`,
  ].join(",");

  try {
    execSync(
      `ffmpeg -y -f lavfi -i "gradients=s=540x720:c0=${c1}:c1=${c2}:x0=80:y0=40:x1=480:y1=680:speed=0.03:nb_colors=2:d=4" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 26 -an "${out}"`,
      { stdio: "pipe" }
    );
  } catch {
    execSync(
      `ffmpeg -y -f lavfi -i "color=c=${c1}:s=540x720:d=4" -vf "drawbox=y=ih*0.6:h=ih*0.4:color=${c3}@0.7:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${title}':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=h*0.7" -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 28 -an "${out}"`,
      { stdio: "inherit" }
    );
  }

  execSync(`ffmpeg -y -ss 1 -i "${out}" -frames:v 1 -q:v 3 "${thumb}"`, { stdio: "pipe" });
  const dur = Number(
    execSync(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${out}"`, {
      encoding: "utf8",
    }).trim()
  );
  video.thumbnail = `/uploads/thumbs/${video.id}.jpg`;
  video.duration = Math.max(1, Math.round(dur));
  video.url = `/api/videos/${video.id}/stream`;
  console.log("ok", video.id, video.title);
}

fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(`Seeded ${(store.videos || []).length} demo videos.`);
