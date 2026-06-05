import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from the app directory, regardless of the process working directory.
dotenv.config({ path: path.join(__dirname, ".env") });

const { default: express } = await import("express");
const { getMockDashboard } = await import("./mock.js");
const { getDashboard } = await import("./hubstaff.js");
const app = express();

const USE_MOCK = String(process.env.USE_MOCK ?? "true").toLowerCase() !== "false";
const PORT = Number(process.env.PORT || 3000);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_SEC || 60) * 1000;

let cache = { data: null, at: 0, error: null };

async function loadData() {
  if (USE_MOCK) return getMockDashboard();
  return getDashboard();
}

app.get("/api/dashboard", async (req, res) => {
  const fresh = Date.now() - cache.at < CACHE_TTL_MS;
  if (cache.data && fresh) return res.json(cache.data);

  try {
    const data = await loadData();
    cache = { data, at: Date.now(), error: null };
    res.json(data);
  } catch (err) {
    console.error("[dashboard] load failed:", err.message);
    cache.error = err.message;
    // Serve stale data if we have any; otherwise surface the error.
    if (cache.data) return res.json({ ...cache.data, stale: true, error: err.message });
    res.status(502).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(
    `Dashboard on http://localhost:${PORT}  (source: ${USE_MOCK ? "MOCK" : "Hubstaff API"})`
  );
});
