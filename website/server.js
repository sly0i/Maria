import express from "express";
import multer from "multer";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8765);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "maria-dev-secret";

const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const VIDEOS_DIR = path.join(UPLOADS_DIR, "videos");
const LOGO_DIR = path.join(UPLOADS_DIR, "logo");

for (const dir of [DATA_DIR, VIDEOS_DIR, LOGO_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const DEFAULT_STORE = {
  brandName: "Maria",
  logoPath: "/assets/logo.svg",
  tagline: "Bienvenue. L’accès est réservé aux personnes majeures.",
  description: "Regarde les dernières publications",
  videos: [],
  members: [],
};

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      writeStore(DEFAULT_STORE);
      return structuredClone(DEFAULT_STORE);
    }
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return {
      ...DEFAULT_STORE,
      ...raw,
      videos: Array.isArray(raw.videos) ? raw.videos : [],
      members: Array.isArray(raw.members) ? raw.members : [],
    };
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data?.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const session = verifyToken(req.cookies?.admin_session);
  if (!session?.admin) {
    return res.status(401).json({ error: "Non autorisé" });
  }
  req.admin = session;
  next();
}

function findMemberById(store, id) {
  return store.members.find((m) => m.id === id) || null;
}

function getMemberFromRequest(req) {
  const session = verifyToken(req.cookies?.member_session);
  if (!session?.memberId) return null;
  const store = readStore();
  const member = findMemberById(store, session.memberId);
  if (!member) return null;
  return member;
}

function publicMember(member) {
  if (!member) return null;
  return {
    id: member.id,
    email: member.email,
    phone: member.phone,
    status: member.status,
  };
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function setMemberCookie(res, memberId) {
  const token = signToken({
    memberId,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
  });
  res.cookie("member_session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

function safeExt(originalName, fallback) {
  const ext = path.extname(originalName || "").toLowerCase();
  if (!ext || ext.length > 10) return fallback;
  return ext;
}

function publicConfig(store) {
  return {
    brandName: store.brandName,
    logoPath: store.logoPath,
    tagline: store.tagline,
    description: store.description,
  };
}

function publicVideo(video) {
  return {
    id: video.id,
    title: video.title,
    createdAt: video.createdAt,
    watchUrl: `/watch/${video.id}`,
  };
}

function findVideo(store, id) {
  return store.videos.find((v) => v.id === id && v?.filename) || null;
}

async function needsTranscode(filePath) {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "default=nokey=1:noprint_wrappers=1",
        filePath,
      ],
      { timeout: 30000 }
    );
    const codec = String(stdout || "").trim().toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".mp4" && (codec === "h264" || codec === "avc1")) return false;
    return true;
  } catch {
    return true;
  }
}

async function transcodeToMp4(inputPath) {
  const id = path.parse(inputPath).name;
  const outputPath = path.join(VIDEOS_DIR, `${id}.mp4`);
  const tmpPath = path.join(VIDEOS_DIR, `${id}.tmp.mp4`);

  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      tmpPath,
    ],
    { timeout: 1000 * 60 * 20 }
  );

  fs.renameSync(tmpPath, outputPath);
  if (inputPath !== outputPath && fs.existsSync(inputPath)) {
    fs.unlinkSync(inputPath);
  }
  return outputPath;
}

function streamVideoFile(req, res, filePath) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Vidéo introuvable" });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "private, no-store");

  if (!range) {
    res.setHeader("Content-Length", fileSize);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    return res.status(416).end();
  }

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : fileSize - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
    res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
    return res.end();
  }
  end = Math.min(end, fileSize - 1);
  const chunkSize = end - start + 1;

  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  res.setHeader("Content-Length", chunkSize);
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEOS_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomUUID();
    cb(null, `${id}${safeExt(file.originalname, ".mp4")}`);
  },
});

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOGO_DIR),
  filename: (_req, file, cb) => {
    cb(null, `logo-${Date.now()}${safeExt(file.originalname, ".png")}`);
  },
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) return cb(null, true);
    cb(new Error("Seuls les fichiers vidéo sont acceptés"));
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Seules les images sont acceptées"));
  },
});

const app = express();
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.get("/api/config", (_req, res) => {
  res.json(publicConfig(readStore()));
});

app.get("/api/videos", (_req, res) => {
  const store = readStore();
  const videos = [...store.videos]
    .filter((v) => v?.filename && fs.existsSync(path.join(VIDEOS_DIR, v.filename)))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(publicVideo);
  res.json({ videos });
});

app.get("/api/videos/:id", (req, res) => {
  const store = readStore();
  const video = findVideo(store, req.params.id);
  if (!video || !fs.existsSync(path.join(VIDEOS_DIR, video.filename))) {
    return res.status(404).json({ error: "Vidéo introuvable" });
  }
  res.json({ video: publicVideo(video) });
});

app.get("/api/videos/:id/stream", (req, res) => {
  const admin = verifyToken(req.cookies?.admin_session);
  const member = getMemberFromRequest(req);

  if (!admin?.admin && member?.status !== "approved") {
    return res.status(401).json({
      error: "Connexion et validation admin requises pour regarder cette vidéo",
      code: "AUTH_REQUIRED",
    });
  }

  const store = readStore();
  const video = findVideo(store, req.params.id);
  if (!video) return res.status(404).json({ error: "Vidéo introuvable" });

  streamVideoFile(req, res, path.join(VIDEOS_DIR, video.filename));
});

app.get("/api/auth/me", (req, res) => {
  const member = getMemberFromRequest(req);
  if (!member) return res.json({ authenticated: false, member: null });
  res.json({ authenticated: true, member: publicMember(member) });
});

app.post("/api/auth/register", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const phone = normalizePhone(req.body?.phone);

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Adresse e-mail invalide" });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: "Numéro de téléphone invalide" });
  }

  const store = readStore();
  const existing = store.members.find((m) => m.email === email);

  if (existing?.status === "approved") {
    return res.status(409).json({
      error: "Un compte existe déjà avec cet e-mail. Connecte-toi.",
    });
  }
  if (existing?.status === "pending") {
    return res.status(409).json({
      error: "Ta demande est déjà en attente de validation par un admin.",
      member: publicMember(existing),
    });
  }
  if (existing?.status === "rejected") {
    existing.phone = phone;
    existing.code = generateCode();
    existing.status = "awaiting_code";
    existing.updatedAt = Date.now();
    writeStore(store);
    setMemberCookie(res, existing.id);
    return res.json({
      ok: true,
      step: "code",
      message: "Un code à 4 chiffres a été généré. Un admin te le communiquera.",
      member: publicMember(existing),
    });
  }

  if (existing?.status === "awaiting_code") {
    existing.phone = phone;
    existing.code = generateCode();
    existing.updatedAt = Date.now();
    writeStore(store);
    setMemberCookie(res, existing.id);
    return res.json({
      ok: true,
      step: "code",
      message: "Un nouveau code à 4 chiffres a été généré. Un admin te le communiquera.",
      member: publicMember(existing),
    });
  }

  const member = {
    id: crypto.randomUUID(),
    email,
    phone,
    code: generateCode(),
    status: "awaiting_code",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    approvedAt: null,
  };
  store.members.push(member);
  writeStore(store);
  setMemberCookie(res, member.id);

  res.status(201).json({
    ok: true,
    step: "code",
    message: "Un code à 4 chiffres a été généré. Un admin te le communiquera.",
    member: publicMember(member),
  });
});

app.post("/api/auth/verify-code", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").trim();

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Adresse e-mail invalide" });
  }
  if (!/^\d{4}$/.test(code)) {
    return res.status(400).json({ error: "Le code doit contenir 4 chiffres" });
  }

  const store = readStore();
  const member = store.members.find((m) => m.email === email);
  if (!member) {
    return res.status(404).json({ error: "Aucun compte trouvé avec cet e-mail" });
  }
  if (member.status === "approved") {
    return res.status(409).json({ error: "Compte déjà validé. Connecte-toi." });
  }
  if (member.status === "pending") {
    setMemberCookie(res, member.id);
    return res.json({
      ok: true,
      step: "pending",
      message: "Code déjà validé. Attends qu’un admin accepte ta demande.",
      member: publicMember(member),
    });
  }
  if (member.code !== code) {
    return res.status(401).json({ error: "retry" });
  }

  member.status = "pending";
  member.updatedAt = Date.now();
  writeStore(store);
  setMemberCookie(res, member.id);

  res.json({
    ok: true,
    step: "pending",
    message:
      "Inscription enregistrée. Attends qu’un admin valide ton compte pour accéder aux vidéos.",
    member: publicMember(member),
  });
});

app.post("/api/auth/login", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").trim();

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Adresse e-mail invalide" });
  }
  if (!/^\d{4}$/.test(code)) {
    return res.status(400).json({ error: "Le code doit contenir 4 chiffres" });
  }

  const store = readStore();
  const member = store.members.find((m) => m.email === email);
  if (!member || member.code !== code) {
    return res.status(401).json({ error: "E-mail ou code incorrect" });
  }

  setMemberCookie(res, member.id);

  if (member.status === "awaiting_code") {
    return res.json({
      ok: true,
      step: "code",
      message: "Entre le code à 4 chiffres pour finaliser ton inscription.",
      member: publicMember(member),
    });
  }
  if (member.status === "pending") {
    return res.json({
      ok: true,
      step: "pending",
      message: "Ton compte attend la validation d’un admin.",
      member: publicMember(member),
    });
  }
  if (member.status === "rejected") {
    return res.status(403).json({
      error: "Ta demande a été refusée. Crée à nouveau un compte.",
      member: publicMember(member),
    });
  }

  res.json({
    ok: true,
    step: "approved",
    message: "Connexion réussie.",
    member: publicMember(member),
  });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("member_session");
  res.json({ ok: true });
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body?.password || "");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Mot de passe incorrect" });
  }
  const token = signToken({
    admin: true,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
  res.cookie("admin_session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
  res.json({ ok: true });
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie("admin_session");
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => {
  const session = verifyToken(req.cookies?.admin_session);
  if (!session?.admin) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true });
});

app.get("/api/admin/members", requireAdmin, (_req, res) => {
  const store = readStore();
  const members = [...store.members]
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    .map((m) => ({
      id: m.id,
      email: m.email,
      phone: m.phone,
      status: m.status,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      approvedAt: m.approvedAt,
    }));
  res.json({ members });
});

app.get("/api/admin/codes", requireAdmin, (_req, res) => {
  const store = readStore();
  const codes = [...store.members]
    .filter((m) => m.code && (m.status === "awaiting_code" || m.status === "pending"))
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    .map((m) => ({
      id: m.id,
      phone: m.phone,
      code: m.code,
      email: m.email,
      status: m.status,
      createdAt: m.createdAt,
    }));
  res.json({ codes });
});

app.post("/api/admin/members/:id/approve", requireAdmin, (req, res) => {
  const store = readStore();
  const member = findMemberById(store, req.params.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  if (member.status !== "pending" && member.status !== "rejected") {
    return res.status(400).json({
      error: "La personne doit d’abord valider son code SMS avant que tu puisses accepter la demande",
    });
  }
  member.status = "approved";
  member.approvedAt = Date.now();
  member.updatedAt = Date.now();
  writeStore(store);
  res.json({ member: publicMember(member) });
});

app.post("/api/admin/members/:id/reject", requireAdmin, (req, res) => {
  const store = readStore();
  const member = findMemberById(store, req.params.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  if (member.status !== "pending" && member.status !== "awaiting_code") {
    return res.status(400).json({ error: "Cette demande ne peut pas être refusée" });
  }
  member.status = "rejected";
  member.updatedAt = Date.now();
  writeStore(store);
  res.json({ member: publicMember(member) });
});

app.put("/api/admin/brand", requireAdmin, (req, res) => {
  const store = readStore();
  const brandName = String(req.body?.brandName || "").trim();
  const tagline = req.body?.tagline !== undefined ? String(req.body.tagline).trim() : store.tagline;
  const description =
    req.body?.description !== undefined ? String(req.body.description).trim() : store.description;

  if (!brandName) {
    return res.status(400).json({ error: "Le nom est requis" });
  }

  store.brandName = brandName;
  store.tagline = tagline;
  store.description = description || DEFAULT_STORE.description;
  writeStore(store);
  res.json(publicConfig(store));
});

app.post("/api/admin/logo", requireAdmin, (req, res) => {
  uploadLogo.single("logo")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucun logo envoyé" });

    const store = readStore();
    const previous = store.logoPath;
    store.logoPath = `/uploads/logo/${req.file.filename}`;
    writeStore(store);

    if (previous && previous.startsWith("/uploads/logo/")) {
      const prevPath = path.join(__dirname, previous.replace(/^\//, ""));
      fs.promises.unlink(prevPath).catch(() => {});
    }

    res.json({ logoPath: store.logoPath });
  });
});

app.post("/api/admin/videos", requireAdmin, (req, res) => {
  uploadVideo.single("video")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucune vidéo envoyée" });

    const title = String(req.body?.title || "").trim();
    if (!title) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Le titre est requis" });
    }

    let finalPath = req.file.path;
    let filename = req.file.filename;

    try {
      if (await needsTranscode(req.file.path)) {
        finalPath = await transcodeToMp4(req.file.path);
        filename = path.basename(finalPath);
      } else if (path.extname(filename).toLowerCase() !== ".mp4") {
        const renamed = path.join(VIDEOS_DIR, `${path.parse(filename).name}.mp4`);
        fs.renameSync(req.file.path, renamed);
        finalPath = renamed;
        filename = path.basename(renamed);
      }
    } catch (convertErr) {
      console.error("Conversion vidéo échouée:", convertErr);
      fs.unlink(req.file.path, () => {});
      if (finalPath !== req.file.path) fs.unlink(finalPath, () => {});
      return res.status(400).json({
        error:
          "Impossible de convertir cette vidéo. Réessaie avec un fichier MP4 (H.264), ou une vidéo plus courte.",
      });
    }

    if (!fs.existsSync(finalPath) || fs.statSync(finalPath).size === 0) {
      fs.unlink(finalPath, () => {});
      return res.status(400).json({ error: "Fichier vidéo invalide après traitement" });
    }

    const store = readStore();
    const entry = {
      id: path.parse(filename).name,
      title,
      filename,
      url: `/api/videos/${path.parse(filename).name}/stream`,
      createdAt: Date.now(),
    };
    store.videos.push(entry);
    writeStore(store);
    res.status(201).json({ video: entry });
  });
});

app.delete("/api/admin/videos/:id", requireAdmin, (req, res) => {
  const store = readStore();
  const index = store.videos.findIndex((v) => v.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Vidéo introuvable" });

  const [removed] = store.videos.splice(index, 1);
  writeStore(store);

  if (removed?.filename) {
    fs.promises.unlink(path.join(VIDEOS_DIR, removed.filename)).catch(() => {});
  }

  res.json({ ok: true });
});

app.use(
  "/uploads/logo",
  express.static(LOGO_DIR, {
    maxAge: "7d",
  })
);

app.use("/uploads/videos", requireAdmin, express.static(VIDEOS_DIR));

app.use("/assets", express.static(path.join(__dirname, "assets")));

app.get("/admin", (_req, res) => {
  sendHtmlWithInlineCss(
    res,
    path.join(__dirname, "admin", "index.html"),
    path.join(__dirname, "admin", "admin.css")
  );
});

app.get("/admin/", (_req, res) => {
  sendHtmlWithInlineCss(
    res,
    path.join(__dirname, "admin", "index.html"),
    path.join(__dirname, "admin", "admin.css")
  );
});

app.use("/admin", express.static(path.join(__dirname, "admin")));

function sendHtmlWithInlineCss(res, htmlPath, cssPath = path.join(__dirname, "styles.css")) {
  try {
    let html = fs.readFileSync(htmlPath, "utf8");
    const css = fs.readFileSync(cssPath, "utf8");
    const cssName = path.basename(cssPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Inline CSS so mobile / Cloudflare tunnels never show a white unstyled page
    // if the separate stylesheet request is blocked or delayed.
    const linkRe = new RegExp(`<link\\s+rel="stylesheet"\\s+href="[^"]*${cssName}"\\s*/?>`, "i");
    if (linkRe.test(html)) {
      html = html.replace(linkRe, `<style>\n${css}\n</style>`);
    } else if (html.includes("</head>")) {
      html = html.replace("</head>", `<style>\n${css}\n</style>\n</head>`);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur de chargement de la page");
  }
}

app.get("/app.js", (_req, res) => {
  res.type("application/javascript");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "app.js"));
});

app.get("/auth.js", (_req, res) => {
  res.type("application/javascript");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "auth.js"));
});

app.get("/watch.js", (_req, res) => {
  res.type("application/javascript");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "watch.js"));
});

app.get("/styles.css", (_req, res) => {
  res.type("text/css");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "styles.css"));
});

app.get("/watch/:id", (_req, res) => {
  sendHtmlWithInlineCss(res, path.join(__dirname, "watch.html"));
});

app.get("/", (_req, res) => {
  sendHtmlWithInlineCss(res, path.join(__dirname, "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Erreur serveur" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Site prêt sur http://0.0.0.0:${PORT}`);
  console.log(`Admin : http://0.0.0.0:${PORT}/admin`);
  console.log(
    `Mot de passe admin par défaut : ${
      ADMIN_PASSWORD === "admin123" ? "admin123 (à changer via ADMIN_PASSWORD)" : "(défini via env)"
    }`
  );
});
