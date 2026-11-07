// Owner: Agent D. Settings sheet: theme, coach speed, equipment summary, backup, restart onboarding,
// dev-data reset (mock mode only) and version.

import { h, button, append, replaceChildren, segmented, openSheet, inlineConfirm, toast, safe, errorText, lsGet, plural } from "./components.js";
import { prettifyId } from "./ops.js";
import { CLEAR_CHAT_COPY } from "./chat.js";

const UI_VERSION = "1.0.0";

/**
 * Open the settings sheet.
 * @param {any} ctx app context
 * @returns {void}
 */
export function openSettings(ctx) {
  const { store, runtime, catalog, coach } = ctx;
  let off = () => {};
  openSheet({
    title: "Settings",
    id: "settings-sheet",
    onClose: () => off(),
    build: (api) => {
      const body = h("div", { class: "settings" });
      const render = () => replaceChildren(body, sections(api));
      off = ctx.on(["state", "profile"], () => {
        // keep focus stable: only refresh the equipment block on profile changes
        const eq = body.querySelector("#settings-equipment");
        if (eq) eq.replaceWith(equipmentSection(api));
      });
      render();
      return body;
    },
  });

  function sections(api) {
    const state = ctx.data.state;
    const theme = state?.settings?.theme || lsGet("pt.theme") || "system";
    const tier = state?.settings?.chatTier === "quick" ? "quick" : "default";

    const themeSeg = segmented({
      id: "settings-theme",
      label: "Theme",
      options: [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }],
      value: theme,
      onChange: (v) => {
        ctx.applyTheme(v);
        if (store) Promise.resolve(store.state.update({ settings: { ...(ctx.data.state?.settings || {}), theme: v } })).catch(() => {});
      },
    });

    const speedSeg = segmented({
      id: "settings-speed",
      label: "Coach speed",
      options: [{ value: "default", label: "Smart" }, { value: "quick", label: "Fast" }],
      value: tier,
      onChange: (v) => {
        if (store) Promise.resolve(store.state.update({ settings: { ...(ctx.data.state?.settings || {}), chatTier: v } })).catch((err) => toast({ text: errorText(coach, err), kind: "error" }));
      },
    });

    return [
      group("Appearance", [row("Theme", "Follows your iPhone unless you pick one.", themeSeg, "settings-theme")]),
      group("Coach", [row("Coach speed", "Smart thinks more. Fast answers sooner, for quick logging at the gym. Plans always use the most capable model.", speedSeg, "settings-speed")]),
      equipmentSection(api),
      dataSection(api),
      runtime?.mode === "mock" && runtime.dev ? devSection() : null,
      h("p", { class: "settings-version num" }, `Personal Trainer ${UI_VERSION} · ${runtime?.mode === "mock" ? "dev mode" : "live"}`),
    ];
  }

  function group(title, children, id) {
    return h("section", { class: "set-group", id, "aria-label": title }, h("h3", { class: "set-group-title" }, title), children);
  }

  function row(label, hint, control, labelFor) {
    return h("div", { class: "set-row" },
      h("div", { class: "set-row-text" }, h("span", { class: "set-label", id: `${labelFor}-label` }, label), hint ? h("span", { class: "set-hint" }, hint) : null),
      control,
    );
  }

  function equipmentSection(api) {
    const profile = ctx.data.profile;
    const locs = profile?.equipment?.locations || [];
    const sched = profile?.schedule;
    const items = locs.filter((l) => (l.items || []).length || l.dumbbellMaxKg || (l.kettlebellsKg || []).length);
    const content = items.length ? items.map((l) => {
      const names = (l.items || []).map((id) => safe(() => catalog.EQUIPMENT?.[id]?.name, "") || prettifyId(id));
      const extras = [
        l.dumbbellMaxKg ? `Dumbbells up to ${l.dumbbellMaxKg} kg` : null,
        (l.kettlebellsKg || []).length ? `Kettlebells ${l.kettlebellsKg.join(", ")} kg` : null,
      ].filter(Boolean);
      return h("div", { class: "eq-loc" },
        h("p", { class: "eq-name" }, l.name || prettifyId(l.id), l.id === profile?.equipment?.defaultLocationId && locs.length > 1 ? h("span", { class: "eq-default" }, "default") : null),
        h("p", { class: "eq-items" }, `${plural(names.length, "item")}: ${names.join(", ")}`),
        extras.length ? h("p", { class: "eq-items" }, extras.join(" · ")) : null,
      );
    }) : [h("p", { class: "set-hint" }, "No equipment saved yet. The coach asks about it during setup.")];
    return h("section", { class: "set-group", id: "settings-equipment", "aria-label": "Training setup" },
      h("h3", { class: "set-group-title" }, "Equipment"),
      sched?.daysPerWeek ? h("p", { class: "eq-sched num" }, `${sched.daysPerWeek} days a week · ${sched.minutesPerSession || 60} min sessions`) : null,
      content,
      store ? button({
        id: "settings-equipment-edit",
        label: "Change with the coach",
        icon: "coach",
        kind: "secondary",
        small: true,
        onClick: () => {
          api.close();
          ctx.chat?.prefill("I want to update my equipment: ");
        },
      }) : null,
    );
  }

  function dataSection(api) {
    const children = [];
    const status = h("p", { class: "set-hint", role: "status", "aria-live": "polite" });
    if (runtime?.downloads && store) {
      children.push(row("Backup", "Save everything (profile, log, plans, chat) as a JSON file.",
        button({
          id: "settings-backup",
          label: "Download backup",
          icon: "download",
          kind: "secondary",
          small: true,
          onClick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            status.textContent = "Preparing…";
            try {
              const data = await store.exportAll();
              const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
              const res = await runtime.downloads.save({ filename: `personal-trainer-backup-${ctx.today()}.json`, data: text });
              status.textContent = res?.status === "delivered" ? "Sent." : "Backup saved.";
            } catch (err) {
              const code = err?.code;
              status.textContent = code === "declined" ? "" : code === "rate_limited" ? "A save prompt is already open. Try again in a moment." : "The backup couldn't be saved in this view.";
            } finally {
              btn.disabled = false;
            }
          },
        }), "settings-backup"));
      children.push(status);
    }
    if (store) {
      const host = h("div", { class: "set-confirm-host" });
      const restartBtn = button({
        id: "settings-restart",
        label: "Restart setup",
        icon: "refresh",
        kind: "secondary",
        small: true,
        onClick: () => inlineConfirm(host, {
          text: "Restart the setup chat? Your log and plans stay. The coach asks the setup questions again and updates your profile.",
          confirmLabel: "Restart setup",
          danger: false,
          idPrefix: "settings-restart",
          onConfirm: async () => {
            try {
              await store.profile.update({ onboarded: false });
              await store.state.update({ onboarding: { status: "not_started" } });
              await Promise.resolve(safe(() => store.chat.append({ role: "event", text: "Setup restarted", actions: [], error: null }), null)).catch(() => {});
              api.close();
              ctx.nav("coach");
            } catch (err) {
              toast({ text: errorText(coach, err), kind: "error" });
            }
          },
        }),
      });
      append(host, [row("Setup", "Go through the onboarding chat again: safety check, goals, schedule, equipment.", restartBtn, "settings-restart")]);
      children.push(host);

      const clearHost = h("div", { class: "set-confirm-host" });
      const clearBtn = button({
        id: "settings-clear-chat",
        label: "Clear chat",
        icon: "trash",
        kind: "secondary",
        small: true,
        onClick: () => inlineConfirm(clearHost, {
          text: CLEAR_CHAT_COPY,
          confirmLabel: "Clear chat",
          danger: true,
          idPrefix: "settings-clear-chat",
          onConfirm: async () => {
            if (ctx.chat?.isBusy?.()) {
              toast({ text: "Wait for the coach to finish, then clear the chat." });
              return;
            }
            const ok = ctx.chat?.clear ? await ctx.chat.clear() : await clearDirect();
            if (ok) {
              api.close();
              ctx.nav("coach");
            }
          },
        }),
      });
      append(clearHost, [row("Conversation", "Delete the chat messages and start a fresh conversation. The coach's memory, your profile, plans and history stay.", clearBtn, "settings-clear-chat")]);
      children.push(clearHost);
    }
    return children.length ? group("Your data", children) : null;
  }

  /** Fallback when the Coach tab failed to mount: clear through the store with an Undo toast. */
  async function clearDirect() {
    try {
      const res = await store.chat.clear();
      toast({ text: "Chat cleared", action: { label: "Undo", fn: () => res?.undo?.() } });
      return true;
    } catch (err) {
      toast({ text: errorText(coach, err), kind: "error" });
      return false;
    }
  }

  function devSection() {
    const host = h("div", { class: "set-confirm-host" });
    const go = async (seed) => {
      try {
        await runtime.dev?.reset?.();
        if (seed) await runtime.dev?.seed?.({ force: true });
      } catch {
        /* dev convenience only */
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("seed");
      window.location.replace(url.toString());
    };
    append(host, [
      row("Reset dev data", "Clears the in-browser database and reloads as a first run.", h("div", { class: "btn-row" },
        button({ id: "settings-dev-seed", label: "Load sample", kind: "ghost", small: true, onClick: () => go(true) }),
        button({
          id: "settings-dev-reset",
          label: "Reset",
          icon: "trash",
          kind: "danger-ghost",
          small: true,
          onClick: () => inlineConfirm(host, { text: "Erase all dev data in this browser?", confirmLabel: "Erase", idPrefix: "settings-dev-reset", onConfirm: () => go(false) }),
        }),
      ), "settings-dev-reset"),
    ]);
    return group("Developer", [host]);
  }
}
