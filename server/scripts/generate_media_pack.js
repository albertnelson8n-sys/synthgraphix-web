const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const dbMod = require("../src/db");
const initDb = dbMod.initDb || dbMod.init;
const run = dbMod.run;
const all = dbMod.all;

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
}

function safeText(s) {
  // keep drawtext safe
  return String(s || "")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/"/g, "”");
}

async function main() {
  await (initDb || (async()=>{}))();

  const outDir = path.join(__dirname, "..", "public", "media");
  fs.mkdirSync(outDir, { recursive: true });

  // Pick some tasks (you can increase later)
  const tasks = await all(
    `SELECT id, answer_text FROM tasks
     WHERE task_type='transcription' AND active=1
     ORDER BY id ASC
     LIMIT 250`
  );

  for (const t of tasks) {
    const id = t.id;
    const txt = String(t.answer_text || "").replace(/\r/g, "").trim();

    const base = `t_${id}`;
    const wav = path.join(outDir, `${base}.wav`);
    const mp3 = path.join(outDir, `${base}.mp3`);
    const mp4 = path.join(outDir, `${base}.mp4`);
    const png = path.join(outDir, `${base}.png`);

    // 1) audio (espeak -> wav)
    if (!fs.existsSync(mp3)) {
      sh("espeak-ng", ["-s", "145", "-w", wav, txt]);
      sh("ffmpeg", ["-y", "-i", wav, "-codec:a", "libmp3lame", "-q:a", "4", mp3]);
      try { fs.unlinkSync(wav); } catch {}
    }

    // 2) image (imagemagick)
    if (!fs.existsSync(png)) {
      // wrap a bit
      const wrapped = txt.length > 220 ? txt.slice(0, 220) + "…" : txt;
      sh("convert", [
        "-size","1080x1080","xc:#0b0f14",
        "-fill","#e5e7eb",
        "-font","DejaVu-Sans",
        "-pointsize","34",
        "-gravity","center",
        "-annotate","+0+0", wrapped,
        png
      ]);
    }

    // 3) video (ffmpeg): background + subtitle text overlay + audio
    if (!fs.existsSync(mp4)) {
      const overlay = safeText(txt.length > 240 ? txt.slice(0, 240) + "…" : txt);
      sh("ffmpeg", [
        "-y",
        "-f","lavfi","-i","color=c=#05070a:s=720x1280:d=8",
        "-i", mp3,
        "-vf", `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${overlay}':fontcolor=white:fontsize=26:line_spacing=8:x=40:y=H-420:box=1:boxcolor=black@0.45:boxborderw=20`,
        "-shortest",
        "-c:v","libx264","-pix_fmt","yuv420p",
        "-c:a","aac",
        mp4
      ]);
    }

    // Rotate media kind based on id (so your pool includes all kinds)
    const kind = (id % 3 === 0) ? "video" : (id % 3 === 1) ? "audio" : "image";
    const url = kind === "video" ? `/media/${base}.mp4` : kind === "audio" ? `/media/${base}.mp3` : `/media/${base}.png`;
    const thumb = kind === "video" ? `/media/${base}.png` : (kind === "audio" ? `/media/${base}.png` : `/media/${base}.png`);

    await run(
      "UPDATE tasks SET media_kind=?, media_url=?, media_thumb=? WHERE id=?",
      [kind, url, thumb, id]
    );
  }

  console.log("✅ Media pack generated and tasks updated!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
