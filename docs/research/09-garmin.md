# 09: Getting Garmin data into the Personal Trainer artifact

Research date: 2026-11-08. Purpose: decide how the owner's Garmin data (Training Readiness, sleep score, HRV status, Body Battery, resting HR, stress, and completed activities) can reach the coach. The coach is a private claude.ai artifact running in the Claude iPhone app. It has no network access of its own. It can use `sample`, `db`, `mcp` (the viewer's claude.ai connectors), and file inputs or paste. A Claude Code environment can also run scheduled tasks and read or write the artifact's db through `ArtifactData`.

**Method and network note.** WebSearch worked. WebFetch failed with ENOTFOUND on the5krunner.com, developer.garmin.com, www8.garmin.com, idevice.com, freddy.coach, athletedata.health and intervals.icu. I stopped fetching those hosts and relied on search snippets for them. GitHub raw files and claude.com/docs were readable, so the Garmin-authored Personal API client, three community MCP servers and Anthropic's connector docs were read directly. I also tested this Claude Code environment's proxy: `personal.connectapi.garmin.com`, `connectapi.garmin.com` and `intervals.icu` are **blocked** (CONNECT 403) under the current network policy.

Confidence tags:
- **[V]**: verified this session from a primary artifact: Garmin's own client source, a project README, Anthropic docs, a tool schema, or a test I ran.
- **[S]**: from search snippets or secondary write-ups only. Usually consistent across several sources, but not read at the source.
- **[K]**: well-established background knowledge that I did not re-read here.
- **[U]**: my inference, or untested. It needs a real test before anyone relies on it.

---

## 0. Bottom line

1. **The news that changes everything:** on 21 Oct 2026 Garmin opened a free **Connect Personal API**. Any Garmin Connect user can create a revocable key in Connect web settings (Settings → Personal API). There is no application and no business entity requirement. It is read-only and pull-only, and it covers sleep (with score), HRV (nightly, weekly average, baseline, status), Body Battery, stress, resting HR, daily summaries, activities with splits, and original FIT downloads [V: Garmin's Apache-licensed client and two community servers; S: launch date].
2. **The Personal API does not expose Training Readiness**, Training Status, recovery time, acute load or Load Focus. Those paths return 404 [V: garmin-health-mcp README; consistent with Garmin's client endpoint list; S: a HealthLog maintainer, 2026-11-04]. Training Readiness therefore stays **manual** (one number typed in, or read from a screenshot), or the coach estimates it.
3. The artifact can't call Garmin itself, but it **can call a claude.ai custom connector** through `mcp`. A remote MCP server that wraps the Personal API already exists with claude.ai-compatible OAuth: **zigmund/garmin-papi-mcp**. It has a public instance, or you can self-host it on a small Linux VPS [V: README]. This is the realistic automated path for one person.
4. **Unofficial libraries** (garth, python-garminconnect) are now the wrong default. garth is deprecated, logins broke in March 2026 when Garmin added TLS fingerprinting, and the current workaround impersonates browsers. They are the only route to Training Readiness, but the ToS and breakage risk aren't worth it for one number you can type in [S].
5. **The Apple Health route loses the Garmin-specific metrics.** No readiness, no Body Battery, no stress, no sleep score, and HRV is probably not synced either. Use it only as a fallback.

**Recommended path:** *Now:* a 10-second manual form plus a "paste a screenshot of Garmin's Morning Report" parser. *Next:* a Personal API key, the garmin-papi-mcp connector, and a "Sync Garmin" button in the artifact. *Later:* a daily scheduled Claude Code task that uses the same connector and writes into the db. Optionally, a FIT import and a calibrated readiness estimate. Details are in §8.

---

## 1. Comparison table

Effort assumes one technically comfortable owner. Cost is per month.

| # | Path | Metrics reached (TR · sleep score · HRV status · BB · RHR · stress · activities) | Reaches the artifact how | Setup effort | Cost | Reliability | ToS / privacy risk | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1a | Garmin Connect Developer Program, business tiers (Health / Activity / Training APIs) | Health API: sleep, HRV summary, stress, dailies; TR not exposed [S] | Needs your own server with push/pull | Weeks, plus a legal entity | Free to fees for large apps [S] | High once approved | Low, but **ineligible**: personal applications are rejected, and intake was paused for most of 2026 [S] | ✗ Not for one person |
| 1b | **Garmin Connect Personal API** (official, Oct 2026) | ✗ TR · ✓ sleep score · ✓ HRV + status/baseline · ✓ BB · ✓ RHR · ✓ stress · ✓ activities, splits, FIT | Not directly. Needs an MCP connector (2b) or a puller (7) | 5 min to make a key | Free | New API, official, no published rate limit [S] | Low: licensed for personal use of your own data [S] | ✓ **Data source of choice** |
| 2a | Unofficial python-garminconnect / garth(-ng), plus local MCPs built on them | Everything, **including TR**, training status, strength sets | Local only. Hosting it remotely means storing your Garmin password/tokens on a server | Hours, with recurring fixes | Free + VPS | **Poor**: March 2026 TLS-fingerprint break, 429 lockouts, garth deprecated [S] | **High**: reverse-engineered, password and MFA tokens in your hands, likely against Garmin's terms [K/S] | ✗ Avoid (TR only, and not worth it) |
| 2b | **Remote MCP connector over the Personal API** (garmin-papi-mcp: public instance or self-hosted) | Same as 1b (no TR) | `mcp` capability in the artifact, plus normal Claude chat on phone and web | 30-60 min (public) or 2-4 h (self-host: VPS, DNS, TLS) | $0 public / ~$4-6 self-host [K] | Good. Garmin JWT 24 h; connector session up to 90 days by default, then re-login [V] | Public instance: a third party sees your key and data in transit. Self-host: only you [V] | ✓ **Next phase** |
| 3 | Garmin → Apple Health → Health Auto Export / Shortcuts → JSON file or paste into the page | ✗ TR · ✗ sleep score · ✗/? HRV · ✗ BB · ✓ RHR · ✗ stress · ✓ workouts (distance, HR, energy) [S] | File input or paste. HAE pushes to REST only (the page has no endpoint) | 1 h | HAE premium for automation (price unverified) | Medium. Garmin→Health sync is flaky per user reports [S] | Low | ✗ Fallback only |
| 3b | Claude iPhone app's own Apple Health integration (US, Pro/Max beta, Jan 2026) | Same Apple Health subset | Claude **chat** only. Not shown to be callable from an artifact's `mcp` [U] | 2 min | Plan | Beta | Anthropic says the data isn't used for training [S] | ~ Chat-only nicety |
| 4 | Garmin data export / single-activity FIT → file input → parse in the browser | Full export: wellness JSON (sleep, maybe TR under DI-Connect-Metrics), HRV_STATUS FIT files [S]. Single FIT: full run and strength-set detail [K] | `<input type=file>` → `@garmin/fitsdk` (official, runs in the browser) from jsDelivr [S] | 1-2 days of dev | Free | Manual. A full export takes days to arrive [S] | Low | ~ Later, for detail and backfill |
| 5a | intervals.icu (approved Garmin partner) + its API / connector | Garmin wellness sync: RHR, HRV, sleep score (mapped to a 1-4 quality scale [S]), weight; BB partial; TR ✗ [S]. Activities ✓ in full | Its connector page (intervals.icu/connector [S]) or community OAuth MCPs → `mcp` | 30 min | Free (supporter optional) | Sync gaps reported on some devices [S] | Medium: Garmin's partner terms restrict passing Garmin data to AI services, and one AI coach on intervals data shut down over this [S] | ~ Viable alternative to 2b |
| 5b | Strava (+ its June 2026 connector, for subscribers [S]) | Activities only, no wellness | Connector | 10 min | Strava sub | Good | Strava API terms (Nov 2024) bar AI use of API data by third parties [S] | ✗ Not for wellness |
| 6 | **Manual entry + fast form + screenshot parse** | ✓ everything Garmin shows you, TR included | Native: form, chat text, or pasted image → `sample` (images) | 0.5-1 day of dev | Free | As reliable as the habit | None | ✓ **Now** |
| 7 | Scheduled Claude Code task → pull → `ArtifactData` write | Whatever its source gives (1b via the connector, or 5a) | Writes db docs the page reads on open | 1-2 h, plus testing | Plan usage, one short session a day | Medium. Several moving parts; key and session expiry | Low with 1b. High with 2a | ✓ **Later** (through the connector, not raw HTTP) |

---

## 2. Garmin Connect Developer Program (business) vs the new Personal API

**Business tiers (Health, Activity, Training, Women's Health, Golf APIs)**
- Eligibility: organisations only. Applicants must be a legal entity (company, university, hospital, research institution), and personal-use applications are rejected [S: openwearables.io guide; Garmin JP Health API page "承認された法人様"]. Garmin paused new access requests in spring 2026 ("evolving and modernizing the program"). Forum threads from Jul-Sep 2026 describe no timeline, and approved partners kept working [S: Garmin forums, tryterra, themomentum]. One source says the program reopened on 21 Oct 2026, together with the Personal tier and a fee for large apps [S: openwearables blog, idevice.com snippet].
- Model: push or ping/pull webhooks to your server, for unlimited users (Enterprise) [S].
- Data: the Health API carries dailies, sleep, stress, HRV summaries (`lastNightAvg`, `lastNight5MinHigh`) and so on. A user who read the docs found **no readiness, recovery time or Body Battery** fields [S: intervals.icu forum]. The **Training API** (pushing structured workouts to the watch calendar) is in the business tiers only, not the Personal tier [S].
- July 2025 brand-attribution rules for partners triggered the Strava-Garmin dispute (Oct 2025). Strava complied, and the patent suit was reportedly dropped [S].
- **Verdict:** not feasible or necessary for one person.

**Personal API (Personal tier)** [V unless tagged]
- Key: created at `connect.garmin.com/app/settings/personalApiToken`, shown once, prefix `GCDC_`. The README says expiry is chosen at creation (30, 90 or 180 days, or 1 year), and Garmin emails about a week before expiry. Garmin's FAQ snippet reportedly answers "No" to "does the key expire", which conflicts [S]. Treat it as expiring and plan for renewal.
- Auth: `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` with `Authorization: ApiKey <key>` returns a JWT, valid about 24 h per garmin-papi-mcp. Data calls then use `Authorization: Bearer <jwt>` on the **same host**. The key can't be used directly on data endpoints [V: Garmin's `constants.py`/`auth.py`; S: FAQ].
- Endpoints in Garmin's own client [V]:
  - **Wellness:** `sleep-service/sleep/dailySleep` and `dailySleepSummariesByDate` (score, stages, overnight vitals), `hrv-service/hrv/{date}` and `hrv/daily/{start}/{end}` (nightly HRV, weekly average, baseline, status), `wellness-service/wellness/bodyBattery/reports/daily`, `usersummary-service/stats/stress/daily`, `wellness-service/wellness/dailyHeartRate` (resting/min/max and 7-day resting average), `usersummary-service/v2/dailysummaries`, SpO2, weight, hydration, food log, fitness age, HR zones.
  - **Activities:** `activitylist-service/activities/search/activities`, `activity-service/activity/{id}` (with splits), `/{id}/workouts` (the structured workout followed), and `download-service/files/activity/{id}` (a ZIP holding the original .fit).
  - **Range caps** apply per endpoint: 28 days for steps, 31 for sleep, and so on [V: garmin-personal-mcp].
- Not exposed: Training Readiness, Training Status, recovery time, acute load, Load Focus (404) [V: garmin-health-mcp README; S: HealthLog issue #1333].
- Rate limits: none published [S: a Personal API PHP client notes the FAQ states no number]. Be gentle: once or twice a day, ranges ≤ 31 days.
- Licence: "available for personal use … your own data" [S: Garmin Personal FAQ snippet]. Giving the key to a third-party server is the user's own decision, and garmin-papi-mcp's own README says so [V].

---

## 3. Unofficial access and MCP servers

**Libraries, status in 2025-2026** [S]
- **garth** (matin): deprecated and unmaintained after Garmin changed the mobile auth flow. Existing OAuth1 sessions last until expiry (~1 year), and new logins fail. A fork, **garth-ng**, claims to restore compatibility.
- **python-garminconnect** (cyberjunky):
  - Login broke around 17 March 2026 (401 at the OAuth preauthorized step; issue #332). This coincided with Garmin adding **TLS fingerprinting**. garmin-connect-export stopped working for the same reason.
  - Release 0.3.0 works around it with `curl_cffi` browser TLS impersonation and randomized fingerprints, and it needs a fresh login.
  - 429 lockouts lasting 48 h+ are reported when scheduled jobs log in repeatedly.
- **ToS:** Garmin publishes no developer terms for this. These libraries reverse-engineer the Connect web/mobile backend, and the current one deliberately evades bot detection. Expect this to be treated as unauthorised automated access, and expect breakage [K/U]. They also need your Garmin **password and MFA tokens** stored wherever the code runs.
- They are the **only** route to Training Readiness, Training Status and Garmin's own acute load (e.g. via `/metrics-service/metrics/trainingstatus/aggregated` in community MCPs) [S].

**Garmin MCP servers** (dozens exist, roughly three families)
- **Personal API, local (stdio):**
  - *Mason-Levyy/garmin-personal-mcp* has 26 tools: one per Personal API endpoint, with range splitting. It's on PyPI and Docker [V].
  - *jonpojonpo/garmin-health-mcp* adds modelled acute/chronic load, recovery time and a **readiness estimate calibrated to the Garmin TR values you log** (40% weighted mean + 60% soft-minimum of six factors) [V]. It was fitted on one rider, so its accuracy is unproven.
  - Local stdio servers work in Claude Desktop or Claude Code. They **don't work from the iPhone app**: the artifact's `host:<name>` servers answer only in a Claude app that runs that local server [V: capability docs].
- **Personal API, remote with OAuth:** *zigmund/garmin-papi-mcp* (Go) [V]:
  - 17 read-only tools: profile, daily summary, sleep, HR, HRV, Body Battery, stress, steps, SpO2, list/get activities, weight, nutrition, hydration, fitness age, wellness activities, menstrual cycle.
  - OAuth 2.1 with Dynamic Client Registration and PKCE, so it works as a claude.ai custom connector on any plan.
  - Your key is sealed (AES-256-GCM) inside the OAuth tokens, with no database. Access tokens last 1 h, refresh tokens 720 h idle, and the absolute session 90 days by default.
  - Public instance: `https://garmin-papi-mcp.zigmund.xyz/mcp`. Self-hosting needs a Linux host with systemd, a DNS name and TLS.
  - Caveat: revoking the key at Garmin takes up to 24 h to cut access, because of the cached JWT.
- **Unofficial-login remote gateways** (PilarJ/mcp-garmin, MissingMCP gateway, "Garmin Chat Connector"): your Garmin password lives on someone's server. ✗ [S].

**Can it become a claude.ai connector the artifact can use?** Yes [V: claude.com/docs connectors page].
- Free, Pro and Max users add a custom connector by HTTPS URL. Free allows one.
- Auth is OAuth (DCR or Claude's published client identity). Fixed request headers are a limited beta, so you can't count on a static API-key header.
- Connectors added on web are available on mobile [S].
- MCP tunnels for private servers are **Enterprise-only research preview**, so they're not an option here [V].
- So the server must be **publicly reachable over HTTPS with OAuth**, and garmin-papi-mcp fits exactly. Hosting a stdio server (garmin-personal-mcp `--http`) remotely would need an OAuth gateway in front, which is more work. Its README warns that it has no auth [V].

---

## 4. Garmin → Apple Health → the page

- **What Garmin Connect writes to Apple Health** [S]:
  - It writes steps, active and resting energy, heart rate, **resting HR**, **sleep analysis** (stages vary by device and firmware), workouts (type, duration, distance, HR, energy; GPS route is inconsistent), weight and body composition, and some respiration/SpO2.
  - It does **not** write Training Readiness, Body Battery, stress, sleep score, VO2max or training load.
  - **HRV:** reports conflict. The better-sourced snippets and Garmin forum users (2022-2026) say Garmin does **not** write HRV to Health. Apple Health stores HRV as SDNN while Garmin uses overnight RMSSD, so the two aren't comparable anyway.
  - Search results were dominated by low-quality content farms (bottegadelsarto.com mirrors), which I disregarded.
- **Getting it into the artifact:**
  - Health Auto Export (iOS) exports 150+ metrics as JSON or CSV. It can automate exports via Shortcuts, and to REST, MQTT or Home Assistant on paid tiers (tier and price unverified) [S].
  - The page has no endpoint to receive a REST push. Usable bridges are a JSON file the user picks with `<input type=file>`, or a Shortcut that copies JSON to the clipboard for pasting into a textarea [U].
  - All of this works, but it gives the coach only RHR, sleep duration and workouts, which are the least Garmin-specific signals.
- The Claude iPhone app's **Apple Health integration** (US beta for Pro/Max since Jan 2026) lets Claude *chat* read movement, sleep and activity [S]. Nothing shows it as a claude.ai connector that an artifact's `mcp` could declare [U]. Test it with `listTools()` before building on it.
- **Verdict:** a fallback for sleep hours, RHR and workouts if everything else fails. Not worth building first.

---

## 5. Garmin data export and FIT files

- **Full account export:** request it in Garmin's Data Management page. A ZIP link arrives by email, which can take days [S]. The ZIP holds:
  - `DI_CONNECT/DI-Connect-Wellness/*sleepData.json` (per-night stages, with scores in newer exports) [S].
  - HRV in `*_HRV_STATUS.fit` files [S].
  - Readiness-like data reportedly under `DI-Connect-Metrics` (an importer lists "TrainingReadiness: HRV") [S].
  - This is good for a one-time **backfill** of 6-12 months of baselines, but not for daily use.
- **A single activity's original FIT:**
  - Get it from Connect web ("Export Original"), from the Personal API download endpoint, or from the watch over USB [K].
  - Whether the Connect iPhone app itself offers FIT export wasn't verified [U].
  - FIT holds `session` (distance, time, avg/max HR, avg speed), `lap`, `record` (per-second HR, pace, cadence), HRV beat intervals if enabled, and for strength activities **`set` messages** (exercise category, reps, weight, duration) [K].
  - Garmin's automatic rep counting and exercise labelling are often wrong unless the user edits them in Connect. The app's own strength log should stay the source of truth [K].
- **Parsing in the browser:**
  - Garmin's official **`@garmin/fitsdk`** (ES module; Node 14+ or a modern browser) offers `Stream.fromByteArray` → `Decoder.read()` → `{messages, errors}`, with `convertDateTimesToDates` [S: npm/GitHub].
  - Load it from `cdn.jsdelivr.net/npm/@garmin/fitsdk@<exact version>` (allowed CDN). Personal API downloads are ZIPs, so the page also needs an unzip library such as `fflate` from the same CDN [U].
  - FIT files for single activities are small (≈50-500 KB), so parsing on the phone is fine [K].
- **Verdict:** a useful *later* feature for run analysis (pace and HR decoupling, lap splits) and history backfill. Not needed for daily readiness.

---

## 6. Intermediaries

- **intervals.icu** (approved Garmin partner, free):
  - Garmin sync brings activities in full, plus wellness: RHR, HRV (rMSSD), sleep duration and score (the official import maps the score to a 1-4 quality scale), and weight. Body Battery comes through only via community bridges [S].
  - Some devices report partial wellness sync [S].
  - API: Basic auth with username `API_KEY` and the key as password; `GET /api/v1/athlete/{id}/wellness?oldest=&newest=` [S].
  - An official connector page exists at intervals.icu/connector [S], and there are community OAuth MCPs (IcuSync, farhoodlabs) [S].
  - Activities synced from Strava are withheld from its API [S].
  - Risk: Garmin's partner terms seem to restrict onward sharing of Garmin data to unapproved services. "Intervals Pro", an AI coach on intervals.icu data, shut down citing this [S]. So intervals.icu's Garmin-sourced data could be restricted in future AI contexts.
  - Overall, it's a reasonable alternative to 2b, especially if the owner already uses intervals.icu for running analysis.
- **Strava:** activities only, no wellness. Its Nov 2024 API agreement bars third parties from using API data for AI [S]. Its own connector (June 2026, subscribers, per a competitor's page) is a first-party exception [S]. Not useful for readiness.
- **Others** (Terra, Sahha, Open Wearables): business aggregators that compute their own scores. ✗ for one person.

---

## 7. Scheduled Claude Code task that pulls Garmin daily

| Option | Feasibility | Notes |
|---|---|---|
| Raw HTTP to the Personal API from the task's container | **Blocked today** [V: proxy 403] | Needs an environment allowlist change for `personal.connectapi.garmin.com`. The key must be a network secret via `request_credential`, never an env var. The proxy injects one fixed header per host, but the Personal API needs `Authorization: ApiKey …` on the token call and `Authorization: Bearer <jwt>` on data calls **to the same host**. Injection would probably clobber the bearer token [U, probably broken]. |
| Raw HTTP to intervals.icu | Plausible | Single-step Basic auth fits `request_credential` (`suggested_type: "basic"`) cleanly [U]. Still needs the host allowlisted. Inherits intervals' data gaps. |
| **Task uses the Garmin claude.ai connector** (garmin-papi-mcp) | **Best** [U, needs one test] | `create_trigger` accepts a `connectors` list that fired sessions may use [V: tool schema]. The session calls `get_sleep`, `get_hrv`, `get_body_battery`, `get_stress`, `get_heart_rate`, `list_activities` for yesterday and today, then one `ArtifactData` `batch` write. No secrets in the environment and no allowlist change. |
| Unofficial library in the task | Poor | Password/MFA tokens in the environment, browser impersonation from a cloud IP, 429 lockouts, ToS. ✗ |
| Claude Code on the owner's Mac (cron/launchd `claude -p`) with a local Personal API MCP + ArtifactData | Works if the Mac is awake [U] | No hosting needed. Key in the macOS keychain or `~/.config/garmin`. |

**Design notes if built:**
- Run once a day at about 09:00-10:00 local, after the watch has synced overnight data. HRV and sleep are empty until the phone syncs [V: garmin-personal-mcp troubleshooting]. Optionally run a second time in the evening for activities.
- Writes are idempotent and keyed by date. They merge into the app's existing `WellnessEntry` shape with `source: "garmin"` and never overwrite a manually entered `trainingReadiness`.
- The app keeps wellness at `data/users/<uid>/wellness`. The db docs call `data/users/<id>/` "private even from the owner" for other people's ids. Whether `ArtifactData` (acting as the owner) can address the owner's own uid path must be tested [U].
  - The safer design is an inbox doc such as `inbox/garmin` (`{days: {"2026-11-08": {...}}, activities: [...], pulledAt}`). The current `{path:"", read:"owner", write:"owner"}` rule already covers it. The page merges it into `wellness` on open.
- Failure modes:
  - The Garmin key expires (renew in Connect).
  - The connector session hits its 90-day cap (re-login in claude.ai → Connectors).
  - Garmin returns `no_data` before the phone syncs.
  - Plan usage: one short session a day.
- Have the page show "Garmin data as of <pulledAt>" and fall back to manual entry when data is stale.

---

## 8. Recommended phased path

### Now (no infrastructure; ~0.5-1 day of app work)
1. **A quick wellness form** on the Today/Coach screen, prefilled from yesterday. It writes the existing `WellnessEntry`:
   - **Training Readiness**: number 0-100.
   - **Sleep score** (0-100), **sleep hours** optional.
   - **HRV status**: four chips (balanced, unbalanced, low, poor). **HRV ms** (last-night average) optional.
   - **Resting HR**.
   - **Body Battery at wake** and **avg stress**: optional, behind "more".
   - One "Save" tap. Target: under 10 seconds.
2. **Screenshot paste:** the user screenshots Garmin Connect's Morning Report or Training Readiness screen and pastes or picks it. The page calls `sample.json` with `images: true`. The prompt asks it to extract exactly the WellnessEntry fields, null when absent, and never to guess. The page shows the parsed values for one-tap confirmation.
   - This needs the `sample` declaration upgraded to `{sample: {images: true}}` and a `(await sample.limits()).images` check [V: capability docs].
   - It's the lowest-friction way to get TR, which no API gives.
3. **Chat parsing:** "readiness 62, sleep 78, HRV balanced, RHR 51" in chat is parsed by the coach's tool call into a wellness entry (agent F's area).
4. Activities: keep logging sessions in the app. For runs, accept typed "8.2 km 46:10 avg HR 148" or a screenshot of the activity summary through the same parser.

### Next (1-2 weeks; 30 min to 4 h setup + ~1 day of app work)
1. Create a **Personal API key** (pick a 1-year expiry and set a calendar reminder).
2. Add **garmin-papi-mcp** as a claude.ai custom connector named e.g. "Garmin".
   - **Preferred:** self-host it on a $4-6/mo VPS (or any always-on Linux box with DNS and TLS), so only you see the key.
   - **Acceptable with eyes open:** the author's public instance, with a short session length and the ability to revoke the key.
   - This also makes Garmin data available in ordinary Claude chat on the phone.
3. In the artifact, declare `mcp: {servers: [{server: "Garmin", tools: ["get_sleep","get_hrv","get_body_battery","get_stress","get_heart_rate","get_daily_summary","list_activities","get_activity"]}]}`.
   - Add a **"Sync Garmin"** button that pulls the last 1-14 days and merges them into `wellness` (`source: "garmin"`). TR stays manual or from a screenshot.
   - Before coding the field mapping, learn the tool argument and result shapes from `describeTool` or one real call. Don't guess [V: capability docs].
   - Handle `null`, consent denial and `tool_error` by falling back to the manual form.
4. Backfill: one sync of 60-90 days, to seed personal baselines (HRV, RHR, sleep). Garmin's HRV payload already includes the baseline band.

### Later (optional)
1. **A daily scheduled Claude Code task** using the Garmin connector, writing an `inbox/garmin` doc via `ArtifactData` (§7). The coach then has fresh data before the app opens, with no consent prompts or latency on the phone.
2. **FIT import** (`@garmin/fitsdk`) for run analysis: splits, HR drift, time in zone. Optionally import strength `set` messages as a *suggestion* to confirm, never as truth.
3. A **readiness estimate** for days without a logged TR, built from sleep, HRV vs baseline, RHR vs 7-day average and the app's own load (session RPE × minutes). Calibrate it against logged Garmin TR values, as garmin-health-mcp does. Always label it as an estimate.
4. Optional: intervals.icu as a second source if the owner wants its running analytics.
5. **Don't build:** the unofficial-library path, Apple Health automation, or the business developer program.

---

## 9. How the coach should use the metrics (rules)

**Evidence base**
- HRV-guided endurance training: individualised adjustment (drop intensity when the 7-day rolling ln rMSSD falls outside the smallest worthwhile change, ≈ baseline mean ± 0.5 SD) gives **small, mostly non-significant** gains over fixed plans in VO2max and performance, with fewer non-responders and similar or less hard training.
  - Manresa-Rocamora 2021 (SMD ≈ 0.20, n.s.), Düking 2021 (performance g ≈ 0.08, n.s.; medium effect on submaximal markers), Javaloyes 2019 (cyclists: +5% PPO, +7% 40-min TT vs no change), Vesterinen 2016 and Kiviniemi 2007 [S/K].
  - Rolling averages beat single-day values [S: Heikura/JYU thesis].
- For **strength training** the evidence is thin, a narrative review only (Addleman 2024) [S].
- Acute sleep loss lowers strength by ~3% and strength endurance by ~10%. The effects are consistent mainly after total deprivation or late-night restriction, and worsen ~0.4% per extra hour awake [S: Craven 2022, Sports Med].
- **Garmin Training Readiness** (1-100) combines six factors: last night's sleep score, recovery time, HRV status, acute load, 3-night sleep history and 3-day stress history.
  - Bands: Poor 1-24, Low 25-49, Moderate 50-74, High 75-94, Prime 95-100 [S: Garmin manuals; the Poor and Prime edges were confirmed in snippets, the middle edges are K].
- **HRV status** compares the 7-day average with your personal baseline:
  - balanced = inside the range
  - unbalanced = above or below it
  - low = well below it
  - poor = baseline below age norms
  - It needs ~3 weeks of sleep data before it appears [S: Garmin manuals].
- **Accuracy:**
  - Garmin wrist overnight RMSSD agrees reasonably but imperfectly with chest-strap ECG (Fenix 6: CCC 0.87, MAPE ~10.5%, the weakest of five devices tested) [S].
  - Sleep staging is only moderately accurate (~70% epoch accuracy) [S].
  - Body Battery has no independent validation [S].
  - A 2025 study found Garmin "stress" correlated little with self-reported stress [S].

**Minimal useful daily set** (in priority order)
1. HRV status (+ last-night ms)
2. Sleep (score, plus hours if available)
3. Resting HR vs its 7-day average
4. Training Readiness
5. Body Battery at wake (optional)
6. Stress (optional, lowest weight)

Subjective inputs always join these: soreness, energy, motivation, pain, illness signs.

**Decision rules** (for `knowledge/chat.js`, `progress.js` and the readiness card)
1. **Trend over a single day.** Judge HRV and RHR against the user's own baseline (Garmin's baseline band, or the app's 28-day mean ± 0.5 SD once ≥14 days exist). One off night is "note it", not "change the plan".
2. **Don't double-count.** TR already contains sleep, HRV status and load. If TR is present, use it as the headline and the components only to explain it. Never penalise poor sleep twice.
3. **Green: train as planned.** TR ≥ 50 *and* HRV balanced *and* no red subjective flags. If TR ≥ 75 and warm-ups feel good, top sets, PR attempts or a quality run are fine.
4. **Amber: keep the session, trim it.** Any **one** of these:
   - TR 25-49
   - HRV unbalanced on the low side or a first "low" day
   - Sleep score < 60 or < 6 h
   - RHR +3-5 bpm over its 7-day average
   - Body Battery at wake < 30

   What to do:
   - **Strength:** keep the planned loads, add +1 RIR (stop a rep earlier), drop the last set of each exercise (≈ −25-33% volume), and skip AMRAPs and top singles.
   - **Running:** turn VO2max intervals into threshold, or threshold into steady/easy. Keep easy runs easy and shorten them by ~20%.
   - **Warm-up test:** if the last warm-up set or the first rep moves normally and RPE matches what's expected, the user may go back to the full plan. Performance on the day beats the watch.
5. **Red: swap to recovery.** Any **two** amber signals together, or any one of these:
   - TR < 25
   - HRV "low" for ≥ 2 consecutive days
   - RHR ≥ +7 bpm over its 7-day average
   - Sleep < 5 h
   - Illness signs

   What to do: replace the session with Z1 cardio of 20-40 min, mobility, or rest, then move the key session 24-48 h later, not dropped.
   - With fever, chest symptoms or RHR ≥ +10 bpm plus feeling unwell: no training. Point the user to the existing safety and referral rules, and never diagnose.
6. **High HRV isn't automatically good.** "Unbalanced (high)" together with raised RHR, illness signs or heavy fatigue counts as amber.
7. **Streaks drive programming, not days.** ≥ 5 amber/red days in 10, or a 7-day HRV average below baseline for ≥ 7 days with stalled lifts, should prompt `progress.js` to suggest a deload or volume cut (ties into its `adjustments` hints). Persistently high readiness with easy RIR feedback supports progressing as planned.
8. **Body Battery and stress are context only.** Mention them, but never let them alone change a session.
9. **Missing or stale data:** fall back to subjective readiness and RIR feedback. Never invent or carry numbers forward. Show the data's date.
10. **Explain briefly.** Each recommendation names its trigger, e.g. "HRV low 2 days + RHR +6 → swapping intervals for 30 min easy". The user can always override, and the override is logged.

---

## Sources

Primary or near-primary, read this session [V]:
- Garmin, *connect-personal-api-python* README and `constants.py` / `auth.py` (base URL, token path, `ApiKey` header, endpoint list): https://github.com/garmin/connect-personal-api-python
- Mason-Levyy, *garmin-personal-mcp* README and CHANGELOG (Personal API launch Oct 2026, key page, expiry choices, tools, HTTP mode has no auth): https://github.com/Mason-Levyy/garmin-personal-mcp
- jonpojonpo, *garmin-health-mcp* README (TR, Training Status, recovery and load not exposed, 404s; readiness model): https://github.com/jonpojonpo/garmin-health-mcp
- zigmund, *garmin-papi-mcp* README (remote OAuth connector, public instance, token lifetimes, self-host requirements): https://github.com/zigmund/garmin-papi-mcp
- Anthropic, "Add a connector that isn't in the directory" (custom connector by URL, OAuth options, request-headers beta): https://claude.com/docs/connectors/custom
- Anthropic, "MCP tunnels" (Enterprise-only research preview): https://claude.com/docs/connectors/mcp-tunnels/overview
- Artifact runtime capability docs (contract 0.2.96): `mcp` host servers vs connectors, `sample` images, db path privacy. Loaded via the artifact-capabilities skill.
- This environment's proxy test (2026-11-08): `personal.connectapi.garmin.com`, `connectapi.garmin.com`, `intervals.icu` → CONNECT 403.

Search-snippet or secondary [S]:
- Garmin Personal API coverage and launch: https://appsforstrava.com/blog/garmin-connect-developer-program-personal-api-key · https://www.badgehero.io/post/2026-10-21-garmin-personal-api-badges/ · https://daash.run/learn/garmin-personal-api · https://www.athletedata.health/guides/garmin-personal-api-claude-chatgpt · https://github.com/MBombeck/HealthLog/issues/1333 · https://developer.garmin.com/gc-developer-program/personal/personal-faq/ · https://the5krunner.com/2026/10/22/garmin-personal-api/
- Business program eligibility and pause: https://openwearables.io/docs/providers/garmin-api-integration · https://tryterra.co/blog/garmin-connect-developer-program-pause · https://openwearables.io/blog/garmin-connect-developer-program-reopened · https://forums.garmin.com/developer/connect-iq/f/discussion/441459/connect-developer-program-what-should-a-solo-developer-do-while-applications-are-paused/2054020 · https://developer.garmin.com/gc-developer-program/health-api-japanese/
- Health API lacks readiness and Body Battery (user report): https://forum.intervals.icu/t/garmin-training-readiness/14534
- Unofficial libraries: https://pypi.org/project/garth/ · https://pypi.org/project/garth-ng/ · https://github.com/cyberjunky/python-garminconnect/issues/332 · https://newreleases.io/project/github/cyberjunky/python-garminconnect/release/0.3.0 · https://github.com/pe-st/garmin-connect-export · https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/433892/tls-fingerprinting-blocks-third-party-clients/2025622 · https://forums.garmin.com/developer/fit-sdk/f/discussion/435087/persistent-429-on-api-login-account-blocked-for-48-hours
- Personal API rate limits not published: https://packagist.org/packages/tomrichmond/garmin-personal-api
- Remote unofficial gateways: https://glama.ai/mcp/servers/PilarJ/mcp-garmin · https://glama.ai/mcp/servers/VelkyVenik/missingmcp
- Apple Health: https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-mobile-ios/409556/sync-hrv-data-to-apple-health · https://www.sensai.fit/blog/wearable-apple-health-integration-what-syncs-oura-whoop-garmin · https://apps.apple.com/app/id1115567069 · https://www.macrumors.com/2026/01/22/claude-ai-adds-apple-health-connectivity/
- Export and FIT: https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/423807/hrv-in-garmin-data-export/1981421 · https://forum.intervals.icu/t/which-files-are-needed-for-importing-all-garmin-data/97571 · https://npmjs.com/package/%40garmin%2Ffitsdk · https://github.com/garmin/fit-javascript-sdk
- intervals.icu: https://forum.intervals.icu/t/api-access-to-intervals-icu/609 · https://forum.intervals.icu/t/garmin-intervals-bridge-your-complete-garmin-fit-files-and-wellness-data-in-intervals-icu-with-or-without-the-official-garmin-integration-now-also-with-garmin-s-personal-api/132863?page=7 · https://forum.intervals.icu/t/garmin-wellness-partial-sync-sleep-works-rhr-hrv-steps-missing/130093 · https://www.intervals.icu/connector/ · https://forum.intervals.icu/t/intervals-icu-api-terms-and-conditions/114087 · https://gadgetsandwearables.com/?p=18601566
- Strava: https://road.cc/content/news/strava-users-cant-publicly-share-data-third-party-apps-311329 · https://techrepublic.com/article/news-strava-api-scraping-crackdown · https://restortrain.com/compare/restortrain-vs-claude · https://www.bikeradar.com/news/strava-we-dont-agree-with-the-extensive-branding-garmin-is-forcing
- Garmin metric definitions: https://www8.garmin.com/manuals/webhelp/GUID-31D23DBB-57C2-4DF7-A0C9-8D1A00AB4BE7/EN-US/GUID-C21BE0C8-A08E-4DA1-B6C6-2E0E2DDDB372.html (Training Readiness) · https://www8.garmin.com/manuals/webhelp/GUID-4462687B-8DF5-4719-872E-E16754F9D4B0/EN-US/GUID-5247CEC7-AF06-44FB-B6AD-87C53D4F7941.html (HRV status) · https://www.wareable.com/garmin/garmin-hrv-status-explained-what-is-it-how-to-use
- Accuracy: https://labfront.com/article/garmin-enhanced-bbi-hrv-accuracy-validation · https://the5krunner.com/2025/08/12/garmin-vivosmart-cant-measure-stress-study-shows-little-correlation-to-self-reported-levels/ · https://www.gneta.app/blog/garmin-body-battery-accuracy
- HRV-guided training: Manresa-Rocamora 2021 https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8507742/ · Düking 2021 (J Sci Med Sport, via https://pubmed.ncbi.nlm.nih.gov/34489178/) · HRV-based VO2max meta-analysis 2020 https://mdpi.com/1660-4601/17/21/7999 · Heikura thesis https://jyx.jyu.fi/handle/123456789/45036 · Javaloyes protocol summary https://www.hrv4training.com/blog2/training-prescription-guided-by-heart-rate-variability · AIS HRV best practice https://www.ais.gov.au/__data/assets/pdf_file/0013/1130260/HRV-BPG_FINAL.pdf · Addleman 2024 narrative review https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11204851/
- Sleep loss: Craven 2022, Sports Med, PMID 35708888 https://www.pubmed.gov/35708888/

Background [K]: FIT message types (session, lap, record, set); Garmin strength rep-count accuracy; VPS pricing; Kiviniemi 2007 and Vesterinen 2016 HRV-guided trials; the middle Training Readiness band edges.

## Verification gaps (test before building)
1. Whether `ArtifactData` acting as the owner can write `data/users/<owner uid>/wellness`. If not, use an `inbox/garmin` doc.
2. Whether `create_trigger` sessions can call a custom connector (garmin-papi-mcp) and `ArtifactData` in the same run.
3. The exact garmin-papi-mcp tool argument and result shapes. Read them with `describeTool` or one real call before mapping fields.
4. Whether the artifact's `mcp` capability works inside the iPhone app for a custom connector (expected yes; confirm with `listTools()`).
5. Personal API key expiry (README: chosen at creation; FAQ snippet: "no").
6. Whether the Claude app's Apple Health integration is visible to an artifact's `mcp` (expected no).
