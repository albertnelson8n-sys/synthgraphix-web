const { initDb, run, get } = require("./db");

// A small set of real media URLs (stable public sample buckets).
// Video samples: commondatastorage gtv-videos-bucket (BigBuckBunny etc).
// Audio samples: codeskulptor / Google storage demo packs.
const VIDEO_URLS = [
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4"
];

const AUDIO_URLS = [
  "https://codeskulptor-demos.commondatastorage.googleapis.com/pang/arrow.mp3",
  "https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3",
  "https://codeskulptor-demos.commondatastorage.googleapis.com/GalaxyInvaders/theme_01.mp3",
  "https://codeskulptor-demos.commondatastorage.googleapis.com/GalaxyInvaders/bonus.wav",
  "https://codeskulptor-demos.commondatastorage.googleapis.com/GalaxyInvaders/explosion_02.wav"
];

const IMAGE_URLS = [
  "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80"
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function rewardFor(type, difficulty) {
  // difficulty 1..3
  if (type === "audio") return 10 + (difficulty - 1) * 5;     // 10,15,20
  if (type === "video") return 15 + (difficulty - 1) * 7;     // 15,22,29
  if (type === "image") return 10 + (difficulty - 1) * 3;     // 10,13,16
  return 10;
}

function makePrompt(kind, i) {
  const topics = [
    "customer support call",
    "delivery status update",
    "short meeting snippet",
    "job interview answer",
    "product feedback note",
    "MPesa payment confirmation",
    "podcast intro line",
    "news headline read-out"
  ];
  const t = topics[i % topics.length];
  if (kind === "audio") return `Listen carefully and transcribe the audio. Topic: ${t}.`;
  if (kind === "video") return `Watch the clip and transcribe what is said in the first 10–15 seconds. Topic: ${t}.`;
  if (kind === "image") return `Write a clear 1-sentence caption describing the image (professional tone).`;
  return `Transcribe the content.`;
}

async function seedTasksIfEmpty() {
  const row = await get("SELECT COUNT(*) AS c FROM tasks");
  if (row && row.c > 100) return;

  // Seed 2200 tasks (mostly transcription).
  const total = 2200;
  for (let i = 1; i <= total; i++) {
    const kind =
      i % 10 === 0 ? "image" : (i % 2 === 0 ? "audio" : "video"); // 10% image, rest audio/video

    const difficulty = (i % 3) + 1; // 1..3
    const reward = rewardFor(kind, difficulty);

    const task_type =
      kind === "audio" ? "transcription_audio" :
      kind === "video" ? "transcription_video" :
      "caption_image";

    const media_url =
      kind === "audio" ? pick(AUDIO_URLS, i) :
      kind === "video" ? pick(VIDEO_URLS, i) :
      pick(IMAGE_URLS, i);

    const title =
      kind === "image" ? `Image Caption Task #${i}` :
      kind === "audio" ? `Audio Transcription Task #${i}` :
      `Video Transcription Task #${i}`;

    const description = makePrompt(kind, i);

    const category =
      kind === "image" ? "Image" :
      "Transcription";

    await run(
      `INSERT INTO tasks (title, description, category, reward_ksh, image, active, task_type, media_url, reference_text)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [title, description, category, reward, kind === "image" ? media_url : null, task_type, media_url, null]
    );
  }
  console.log("Seeded tasks:", total);
}

(async () => {
  await initDb();
  await seedTasksIfEmpty();
  console.log("Migration OK");
  process.exit(0);
})().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
