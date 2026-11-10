// Owner: Agent C. See CONTRACT.md §2, §5.3 and §8.
//
// Runtime detection: the real platform capabilities when the page runs inside
// Claude's viewer (window.claude.use exists), dev mocks otherwise. Works in
// Node too (no window → mock).

const DOWNLOAD_EXTENSIONS = new Set([
  "gif", "png", "jpg", "jpeg", "webp", "mp4", "webm", "mov", "txt", "json", "md",
  "docx", "pptx", "epub", "csv", "ttf", "html", "svg", "pdf", "xlsx", "zip", "fig",
]);

/**
 * @typedef {object} Runtime
 * @property {"live"|"mock"} mode
 * @property {Function|null} sample     the `sample` capability (or the dev mock), null when unavailable
 * @property {object|null} db           the `db` capability (or createMockDb())
 * @property {object|null} user         the `user` capability (or a dev stub)
 * @property {object|null} downloads    the `downloads` capability (or a dev stub); null → hide backup UI
 * @property {string|null} uid          the viewer's id; null → no private storage
 * @property {string[]} problems        any of "db_unavailable", "not_signed_in", "sample_unavailable"
 * @property {{ reset(): Promise<void>, seed(opts?: { force?: boolean }): Promise<object> }|null} dev
 *   mock mode only: `reset()` erases the dev db (reload afterwards), `seed()` fills it with sample data
 */

/**
 * Resolve the platform capabilities.
 *
 * - live when `window.claude` exists (and not `forceMock`): `use("sample" | "db" | "user" | "downloads")`
 *   run concurrently; each resolves null when unavailable (the platform may take up to 10 s).
 *   `uid = await user.id()`.
 * - no `window.claude` on a non-dev host (see isDevHost): "live" with every capability null and all three
 *   problems, so the UI explains instead of running on fake data.
 * - mock when `forceMock`, or `window.claude` is absent on a dev host: an in-memory db persisted to
 *   localStorage, B's `createMockSample()` (null + "sample_unavailable" if that module
 *   isn't ready), uid "dev-user", stub user and downloads. With `?seed` in the URL an
 *   empty dev db is filled by `seedDevData()`.
 *
 * Never rejects.
 *
 * @param {{ forceMock?: boolean, claude?: object, location?: object }} [options]
 *   `claude` overrides `window.claude`, `location` overrides `globalThis.location` (tests).
 * @returns {Promise<Runtime>}
 */
export async function getRuntime({ forceMock = false, claude = globalThis.window?.claude, location = globalThis.location } = {}) {
  if (!forceMock && claude) return liveRuntime(claude);
  // No window.claude. The simulated coach and browser-only data are for development: on any other host (a saved
  // or re-hosted copy of the published page) starting them would let the owner "log" workouts that are never
  // stored in their real data. There the app starts with nothing available and explains why.
  if (!forceMock && !isDevHost(location)) return liveRuntime({});
  return mockRuntime();
}

/**
 * May the mocks run here? Yes without a `location` (Node tests), on localhost / 127.0.0.1 / [::1] / *.localhost,
 * from a file: URL, or with `?mock` in the URL.
 * @param {{ hostname?: string, protocol?: string, search?: string }|undefined|null} location
 * @returns {boolean}
 */
export function isDevHost(location) {
  if (!location || typeof location !== "object") return true;
  const host = String(location.hostname ?? "").toLowerCase();
  if (location.protocol === "file:" || host === "" || host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1" || host.endsWith(".localhost")) return true;
  try { return new URLSearchParams(String(location.search ?? "")).has("mock"); } catch { return false; }
}

async function liveRuntime(claude) {
  const use = async (name) => {
    try {
      return typeof claude.use === "function" ? (await claude.use(name)) ?? null : null;
    } catch {
      return null;
    }
  };
  const [sample, db, user, downloads] = await Promise.all(["sample", "db", "user", "downloads"].map(use));
  let uid = null;
  if (user) {
    try {
      const id = await user.id();
      uid = typeof id === "string" && id ? id : null;
    } catch {
      uid = null;
    }
  }
  const problems = [];
  if (!db) problems.push("db_unavailable");
  if (!uid) problems.push("not_signed_in");
  if (!sample) problems.push("sample_unavailable");
  return { mode: "live", sample, db, user, downloads, uid, problems, dev: null };
}

async function mockRuntime() {
  const { createMockDb, seedDevData } = await import("./store-mock.js");
  const db = createMockDb({ persist: "localStorage" });
  const uid = "dev-user";
  const problems = [];

  let sample = null;
  try {
    const mod = await import("./sample-mock.js");
    sample = typeof mod.createMockSample === "function" ? mod.createMockSample() ?? null : null;
  } catch {
    sample = null; // B's mock is missing or still a skeleton
  }
  if (!sample) problems.push("sample_unavailable");
  // ?mockfail=invalid_json (or rate_limited, upstream_error…; comma-separated for several): the next plan call(s) fail
  for (const code of mockFailCodes()) sample?.failNext?.({ code, verb: "json" });

  const dev = {
    async reset() {
      db.__mock.reset();
      await db.__mock.flush();
    },
    async seed({ force = false } = {}) {
      const { createStore } = await import("./store.js");
      return seedDevData(createStore(db, uid), { force });
    },
  };

  if (wantsSeed()) {
    try { await dev.seed(); } catch { /* dev convenience only */ }
  }

  return { mode: "mock", sample, db, user: createMockUser(uid), downloads: createMockDownloads(), uid, problems, dev };
}

function mockFailCodes() {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? "").get("mockfail");
    return v ? v.split(",").map((c) => c.trim()).filter((c) => /^[a-z_]{1,40}$/.test(c)) : [];
  } catch {
    return [];
  }
}

function wantsSeed() {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").has("seed");
  } catch {
    return false;
  }
}

function createMockUser(uid) {
  const avatarUrl = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#5b7083"/>' +
    '<text x="20" y="26" font-size="16" text-anchor="middle" fill="#fff" font-family="sans-serif">D</text></svg>',
  );
  const me = Object.freeze({ id: uid, name: "Dev", avatarUrl, color: "#5b7083", email: null, isOwner: true, canEdit: true });
  return Object.freeze({
    id: async () => uid,
    me: async () => me,
    isOwner: async () => true,
    canEdit: async () => true,
    can: async () => true,
    name: async () => me.name,
    avatarUrl: async () => avatarUrl,
    email: async () => null,
    search: async () => [],
    profiles: async (ids) => {
      const out = {};
      for (const id of [].concat(ids)) {
        out[id] = { id, name: id === uid ? me.name : "", avatarUrl, color: me.color, email: null, isOwner: id === uid, isMe: id === uid, guest: false };
      }
      return out;
    },
  });
}

/** Dev stand-in for `downloads`: validates like the real one, then triggers a blob download in a browser. */
function createMockDownloads() {
  const saved = [];
  const fail = (code, message) => Object.assign(new Error(message), { code });
  return Object.freeze({
    async save({ filename, data } = {}) {
      if (typeof filename !== "string" || !filename || filename.length > 512) throw fail("bad_request", "filename must be a string of 1-512 characters");
      const dot = filename.lastIndexOf(".");
      const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
      if (!DOWNLOAD_EXTENSIONS.has(ext)) throw fail("rejected_extension", `".${ext}" is not an allowed download extension`);
      const isBlob = typeof Blob !== "undefined" && data instanceof Blob;
      const isBytes = data instanceof ArrayBuffer || ArrayBuffer.isView(data);
      if (!(typeof data === "string" || isBlob || isBytes)) throw fail("bad_request", "data must be a string, Blob, ArrayBuffer or view");
      const size = typeof data === "string" ? new TextEncoder().encode(data).length : isBlob ? data.size : data.byteLength;
      if (!size) throw fail("bad_request", "data is empty");
      saved.push({ filename, size, at: new Date().toISOString() });
      if (typeof document !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        const blob = isBlob ? data : new Blob([data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      return { status: "saved" };
    },
    /** Dev only: what save() was asked to save. */
    __mock: Object.freeze({ saved: () => saved.slice() }),
  });
}
