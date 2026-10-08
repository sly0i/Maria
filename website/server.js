import express from "express";
import multer from "multer";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
  videos: [],
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
    };
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySession(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data?.admin || !data?.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const session = verifySession(req.cookies?.admin_session);
  if (!session) {
    return res.status(401).json({ error: "Non autorisé" });
  }
  req.admin = session;
  next();
}

function safeExt(originalName, fallback) {
  const ext = path.extname(originalName || "").toLowerCase();
  if (!ext || ext.length > 10) return fallback;
  return ext;
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
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 Go
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
  const store = readStore();
  res.json({
    brandName: store.brandName,
    logoPath: store.logoPath,
    tagline: store.tagline,
  });
});

app.get("/api/videos", (_req, res) => {
  const store = readStore();
  const videos = [...store.videos].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ videos });
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body?.password || "");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Mot de passe incorrect" });
  }
  const token = signSession({
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
  const session = verifySession(req.cookies?.admin_session);
  if (!session) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true });
});

app.put("/api/admin/brand", requireAdmin, (req, res) => {
  const store = readStore();
  const brandName = String(req.body?.brandName || "").trim();
  const tagline = req.body?.tagline !== undefined ? String(req.body.tagline).trim() : store.tagline;

  if (!brandName) {
    return res.status(400).json({ error: "Le nom est requis" });
  }

  store.brandName = brandName;
  store.tagline = tagline;
  writeStore(store);
  res.json({
    brandName: store.brandName,
    logoPath: store.logoPath,
    tagline: store.tagline,
  });
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
  uploadVideo.single("video")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucune vidéo envoyée" });

    const title = String(req.body?.title || "").trim();
    if (!title) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Le titre est requis" });
    }

    const store = readStore();
    const entry = {
      id: path.parse(req.file.filename).name,
      title,
      filename: req.file.filename,
      url: `/uploads/videos/${req.file.filename}`,
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

app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/admin", express.static(path.join(__dirname, "admin")));

app.get("/app.js", (_req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});

app.get("/styles.css", (_req, res) => {
  res.sendFile(path.join(__dirname, "styles.css"));
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Erreur serveur" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Site prêt sur http://0.0.0.0:${PORT}`);
  console.log(`Admin : http://0.0.0.0:${PORT}/admin`);
  console.log(`Mot de passe admin par défaut : ${ADMIN_PASSWORD === "admin123" ? "admin123 (à changer via ADMIN_PASSWORD)" : "(défini via env)"}`);
});
