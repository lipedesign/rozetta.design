figma.showUI(__html__, { width: 400, height: 560, themeColors: true });

const STORAGE_KEY = "rozetta-studio-bridge:v1";
const DOCUMENTCHANGE_DEBOUNCE_MS = 500;
const POST_APPLY_MUTE_MS = 2000;
const VARIABLE_POLL_INTERVAL_MS = 1500;

let liveSyncEnabled = false;
let mutedUntil = 0;
let documentChangeTimer = null;
let documentChangeListenerAttached = false;
let variablePollTimer = null;
let lastVariableSignature = "";

logBridge("runtime started", {
  fileKey: figma.fileKey || "local-figma-file",
  fileName: figma.root.name || "Untitled Figma file",
});

figma.ui.onmessage = async (message) => {
  try {
    logBridge("message received", { type: message && message.type });

    if (message.type === "rozetta-load-pairing") {
      const config = await figma.clientStorage.getAsync(STORAGE_KEY);
      logBridge("pairing loaded", summarizePairing(config || {}));
      figma.ui.postMessage({
        type: "rozetta-pairing-loaded",
        config: config || {},
      });
      return;
    }

    if (message.type === "rozetta-save-pairing") {
      await figma.clientStorage.setAsync(STORAGE_KEY, message.config || {});
      logBridge("pairing saved", summarizePairing(message.config || {}));
      figma.ui.postMessage({
        type: "rozetta-pairing-saved",
        config: message.config || {},
      });
      return;
    }

    if (message.type === "rozetta-export-snapshot") {
      logBridge("snapshot export requested");
      const snapshot = await createSnapshot();
      logBridge("snapshot export finished", summarizeSnapshot(snapshot));
      figma.ui.postMessage({ type: "rozetta-snapshot", snapshot });
      return;
    }

    if (message.type === "rozetta-apply-writeback") {
      logBridge("writeback requested", summarizeWriteback(message.payload));
      // Mute documentchange-driven snapshots while we apply, otherwise the
      // edits we're about to make will immediately echo back as a snapshot
      // push and loop.
      mutedUntil = Date.now() + POST_APPLY_MUTE_MS;
      const result = await applyWritebackPayload(message.payload);
      // Re-arm the mute window after apply so any trailing documentchange
      // events for this batch also get suppressed.
      mutedUntil = Date.now() + POST_APPLY_MUTE_MS;
      logBridge("writeback finished", result);
      figma.ui.postMessage({ type: "rozetta-writeback-result", result });
      figma.notify(
        `Rozetta writeback: ${result.updated + result.created} applied, ${result.skipped} skipped, ${result.failed} failed.`
      );
      return;
    }

    if (message.type === "rozetta-live-sync-set") {
      liveSyncEnabled = Boolean(message.enabled);
      if (liveSyncEnabled) {
        attachDocumentChangeListener();
        startVariablePolling();
      } else {
        detachDocumentChangeListener();
        stopVariablePolling();
      }
      logBridge("live sync toggle", { enabled: liveSyncEnabled });
      figma.ui.postMessage({
        type: "rozetta-live-sync-state",
        enabled: liveSyncEnabled,
      });
      return;
    }

    if (message.type === "rozetta-notify") {
      figma.notify(message.message);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Rozetta Bridge failed.";
    console.error("[Rozetta Bridge]", "runtime error", error);
    figma.ui.postMessage({ type: "rozetta-error", error: messageText });
    figma.notify(messageText, { error: true });
  }
};

async function createSnapshot() {
  const startedAt = Date.now();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  logBridge("figma variables read", {
    collections: collections.length,
    variables: variables.length,
    durationMs: Date.now() - startedAt,
  });
  const collectionNameById = new Map(
    collections.map((collection) => [collection.id, collection.name])
  );

  return {
    fileKey: figma.fileKey || "local-figma-file",
    name: figma.root.name || "Untitled Figma file",
    url: figma.fileKey ? `https://www.figma.com/design/${figma.fileKey}` : undefined,
    source: "plugin",
    createdAt: new Date().toISOString(),
    collections: collections.map((collection) => ({
      collectionId: collection.id,
      name: collection.name,
      modes: collection.modes.map((mode) => ({
        modeId: mode.modeId,
        name: mode.name,
      })),
      variableIds: collection.variableIds,
    })),
    variables: variables.map((variable) => ({
      id: variable.id,
      key: variable.key,
      name: variable.name,
      collectionId: variable.variableCollectionId,
      collectionName:
        collectionNameById.get(variable.variableCollectionId) || "Unknown collection",
      resolvedType: variable.resolvedType,
      valuesByMode: variable.valuesByMode,
      description: variable.description || undefined,
      scopes: variable.scopes || [],
      codeSyntax: variable.codeSyntax || {},
    })),
  };
}

async function applyWritebackPayload(payload) {
  if (!payload || payload.version !== "rozetta-figma-writeback/v1") {
    throw new Error("Expected a rozetta-figma-writeback/v1 payload.");
  }
  if (payload.safety && payload.safety.destructiveDeletes) {
    throw new Error("Destructive deletes are blocked in Rozetta Bridge v1.");
  }

  const sets = Array.isArray(payload.sets) ? payload.sets : [];
  const bindings = Array.isArray(payload.bindings) ? payload.bindings : [];
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  logBridge("writeback local figma state read", {
    sets: sets.length,
    bindings: bindings.length,
    collections: collections.length,
    variables: variables.length,
  });

  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  const collectionByName = new Map(collections.map((collection) => [collection.name, collection]));
  const variableById = new Map(variables.map((variable) => [variable.id, variable]));
  const variableByCollectionAndName = new Map(
    variables.map((variable) => [
      `${variable.variableCollectionId}:${variable.name}`,
      variable,
    ])
  );
  const setById = new Map(sets.map((set) => [set.id, set]));
  const prepared = [];
  const variableByTokenAndMode = new Map();
  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    operations: [],
  };

  for (const binding of bindings) {
    try {
      const set = setById.get(binding.setId);
      const token = set ? readTokenForBinding(set, binding) : undefined;
      if (!token) {
        result.skipped += 1;
        result.operations.push(operation(binding, "skipped", "Token not found in payload."));
        continue;
      }

      const metadata = binding.metadata || {};
      const collectionName = safeString(metadata.collectionName, "Rozetta");
      const modeName = safeString(metadata.modeName, "Default");
      const variableName = safeString(
        metadata.variableName,
        tokenPathToFigmaName(binding.tokenPath)
      );
      const collection = getOrCreateCollection(
        collectionName,
        collectionByName,
        collectionById
      );
      const mode = getOrCreateMode(collection, modeName);
      const resolvedType = dtcgTypeToFigmaType(token.$type, token.$value);
      const existing =
        variableById.get(binding.variableId) ||
        variableByCollectionAndName.get(`${collection.id}:${variableName}`);

      if (existing && existing.resolvedType !== resolvedType) {
        result.skipped += 1;
        result.operations.push(
          operation(
            binding,
            "skipped",
            `Type mismatch: Figma has ${existing.resolvedType}, Rozetta needs ${resolvedType}.`
          )
        );
        continue;
      }

      const variable =
        existing || figma.variables.createVariable(variableName, collection, resolvedType);
      if (!existing) {
        variableByCollectionAndName.set(`${collection.id}:${variableName}`, variable);
      }
      variableById.set(binding.variableId, variable);
      variableByTokenAndMode.set(`${binding.setId}:${binding.tokenPath}:${mode.name}`, variable);
      prepared.push({ binding, token, variable, mode, wasCreated: !existing });
    } catch (error) {
      result.failed += 1;
      result.operations.push(
        operation(binding, "failed", error instanceof Error ? error.message : "Prepare failed.")
      );
    }
  }

  for (const item of prepared) {
    try {
      const value = toFigmaValue(item.token.$value, item.mode.name, variableByTokenAndMode);
      item.variable.setValueForMode(item.mode.modeId, value);
      if (typeof item.token.$description === "string") {
        item.variable.description = item.token.$description;
      }
      if (item.wasCreated) result.created += 1;
      else result.updated += 1;
      result.operations.push(
        operation(item.binding, item.wasCreated ? "created" : "updated", item.variable.name)
      );
    } catch (error) {
      result.failed += 1;
      result.operations.push(
        operation(item.binding, "failed", error instanceof Error ? error.message : "Apply failed.")
      );
    }
  }

  return result;
}

function logBridge(message, details) {
  if (details === undefined) {
    console.log("[Rozetta Bridge]", message);
    return;
  }
  console.log("[Rozetta Bridge]", message, details);
}

function summarizePairing(config) {
  return {
    serverUrl: config.serverUrl || "not set",
    hasPairingCode: Boolean(config.pairingCode),
    pairingCodeLength: config.pairingCode ? String(config.pairingCode).length : 0,
  };
}

function summarizeSnapshot(snapshot) {
  return {
    fileKey: snapshot.fileKey,
    name: snapshot.name,
    collections: Array.isArray(snapshot.collections) ? snapshot.collections.length : 0,
    variables: Array.isArray(snapshot.variables) ? snapshot.variables.length : 0,
    createdAt: snapshot.createdAt,
  };
}

function summarizeWriteback(payload) {
  return {
    version: payload && payload.version,
    sets: payload && Array.isArray(payload.sets) ? payload.sets.length : 0,
    themes: payload && Array.isArray(payload.themes) ? payload.themes.length : 0,
    bindings: payload && Array.isArray(payload.bindings) ? payload.bindings.length : 0,
  };
}

function getOrCreateCollection(name, collectionByName, collectionById) {
  const existing = collectionByName.get(name);
  if (existing) return existing;
  const collection = figma.variables.createVariableCollection(name);
  collectionByName.set(name, collection);
  collectionById.set(collection.id, collection);
  return collection;
}

function getOrCreateMode(collection, name) {
  const existing = collection.modes.find((mode) => mode.name === name);
  if (existing) return existing;
  const modeId = collection.addMode(name);
  return { modeId, name };
}

function readTokenAtPath(root, path) {
  const segments = String(path).split(".").filter(Boolean);
  let cursor = root;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = cursor[segment];
  }
  return cursor && typeof cursor === "object" && "$value" in cursor ? cursor : undefined;
}

function readTokenForBinding(set, binding) {
  const modeId =
    binding && binding.rozettaModeId
      ? binding.rozettaModeId
      : binding && binding.metadata
        ? binding.metadata.rozettaModeId
        : undefined;
  const modeRoot =
    modeId && set.modeRoots && typeof set.modeRoots === "object"
      ? set.modeRoots[modeId]
      : undefined;
  return (
    readTokenAtPath(modeRoot, binding.tokenPath) ||
    readTokenAtPath(set.root, binding.tokenPath)
  );
}

function dtcgTypeToFigmaType(type, value) {
  if (type === "color") return "COLOR";
  if (type === "number" || typeof value === "number") return "FLOAT";
  if (type === "boolean" || typeof value === "boolean") return "BOOLEAN";
  return "STRING";
}

function toFigmaValue(value, modeName, variableByTokenAndMode) {
  if (typeof value === "string") {
    const alias = value.match(/^\{(.+)\}$/);
    if (alias) {
      const targetPath = alias[1];
      const targetEntry =
        Array.from(variableByTokenAndMode.entries()).find(([key]) =>
          key.endsWith(`:${targetPath}:${modeName}`)
        ) ||
        Array.from(variableByTokenAndMode.entries()).find(([key]) =>
          key.includes(`:${targetPath}:`)
        );
      const target = targetEntry ? targetEntry[1] : undefined;
      if (target && figma.variables.createVariableAlias) {
        return figma.variables.createVariableAlias(target);
      }
      if (target) return { type: "VARIABLE_ALIAS", id: target.id };
      return value;
    }
    const color = parseCssColor(value);
    return color || value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value && typeof value === "object" && "figmaAlias" in value) return String(value.figmaAlias);
  const dtcgColor = parseDtcgColor(value);
  if (dtcgColor) return dtcgColor;
  return String(value === null || value === undefined ? "" : value);
}

function parseDtcgColor(value) {
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.hex === "string") {
    const parsed = parseCssColor(value.hex);
    if (parsed) {
      return {
        r: parsed.r,
        g: parsed.g,
        b: parsed.b,
        a: normalizeAlpha(value.alpha, parsed.a),
      };
    }
  }

  const components = Array.isArray(value.components) ? value.components : undefined;
  if (!components || components.length < 3) return undefined;
  return {
    r: normalizeColorComponent(components[0]),
    g: normalizeColorComponent(components[1]),
    b: normalizeColorComponent(components[2]),
    a: normalizeAlpha(value.alpha, components[3]),
  };
}

function normalizeColorComponent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number > 1) return Math.max(0, Math.min(255, number)) / 255;
  return Math.max(0, Math.min(1, number));
}

function normalizeAlpha(value, fallback) {
  const number = Number(value === undefined ? fallback : value);
  if (!Number.isFinite(number)) return 1;
  if (number > 1) return Math.max(0, Math.min(255, number)) / 255;
  return Math.max(0, Math.min(1, number));
}

function parseCssColor(value) {
  const hex = value.trim().match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const raw = hex[1];
    return {
      r: parseInt(raw.slice(0, 2), 16) / 255,
      g: parseInt(raw.slice(2, 4), 16) / 255,
      b: parseInt(raw.slice(4, 6), 16) / 255,
      a: raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgba = value
    .trim()
    .match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/i);
  if (!rgba) return undefined;
  return {
    r: clamp255(Number(rgba[1])) / 255,
    g: clamp255(Number(rgba[2])) / 255,
    b: clamp255(Number(rgba[3])) / 255,
    a: rgba[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgba[4]))),
  };
}

function clamp255(value) {
  return Math.max(0, Math.min(255, value));
}

function tokenPathToFigmaName(path) {
  return String(path)
    .split(".")
    .filter(Boolean)
    .map((segment) => segment.trim())
    .join("/");
}

function safeString(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function operation(binding, status, detail) {
  return {
    status,
    setId: binding ? binding.setId : undefined,
    tokenPath: binding ? binding.tokenPath : undefined,
    variableId: binding ? binding.variableId : undefined,
    detail,
  };
}

function attachDocumentChangeListener() {
  if (documentChangeListenerAttached) return;
  // The Figma Plugin API only delivers `documentchange` while the plugin is
  // open. That matches our "always on while the plugin UI is visible" model.
  figma.on("documentchange", handleDocumentChange);
  documentChangeListenerAttached = true;
  logBridge("documentchange listener attached");
}

function detachDocumentChangeListener() {
  if (!documentChangeListenerAttached) return;
  figma.off("documentchange", handleDocumentChange);
  documentChangeListenerAttached = false;
  if (documentChangeTimer) {
    clearTimeout(documentChangeTimer);
    documentChangeTimer = null;
  }
  logBridge("documentchange listener detached");
}

function handleDocumentChange(event) {
  if (!liveSyncEnabled) return;
  if (Date.now() < mutedUntil) return;
  if (!isVariableRelatedChange(event)) return;
  if (documentChangeTimer) clearTimeout(documentChangeTimer);
  documentChangeTimer = setTimeout(() => {
    documentChangeTimer = null;
    if (Date.now() < mutedUntil) return;
    figma.ui.postMessage({ type: "rozetta-document-changed" });
    logBridge("documentchange relayed to UI");
  }, DOCUMENTCHANGE_DEBOUNCE_MS);
}

function isVariableRelatedChange(event) {
  if (!event || !Array.isArray(event.documentChanges)) return false;
  for (const change of event.documentChanges) {
    if (!change) continue;
    const targetId = String(change.id || (change.node && change.node.id) || "");
    if (targetId.startsWith("VariableID:") || targetId.startsWith("VariableCollectionID:")) {
      return true;
    }
    const changeType = String(change.type || "").toUpperCase();
    if (changeType.includes("VARIABLE")) return true;
  }
  return false;
}

function startVariablePolling() {
  if (variablePollTimer) return;
  // The Figma `documentchange` event does NOT fire for Variable mutations — it
  // only reports scene-graph changes. Variables are a separate API surface, so
  // we have to poll. Cheap: ~1ms in dev to read everything in a small file.
  // We capture a baseline immediately so the first user edit triggers a push
  // (instead of treating the boot state as a change).
  captureVariableBaseline();
  variablePollTimer = setInterval(pollVariableChanges, VARIABLE_POLL_INTERVAL_MS);
  logBridge("variable polling started", { intervalMs: VARIABLE_POLL_INTERVAL_MS });
}

function stopVariablePolling() {
  if (!variablePollTimer) return;
  clearInterval(variablePollTimer);
  variablePollTimer = null;
  lastVariableSignature = "";
  logBridge("variable polling stopped");
}

async function captureVariableBaseline() {
  try {
    lastVariableSignature = await computeVariableSignature();
  } catch (error) {
    logBridge("variable baseline capture failed", {
      message: error && error.message,
    });
  }
}

async function pollVariableChanges() {
  if (!liveSyncEnabled) return;
  if (Date.now() < mutedUntil) return;
  try {
    const signature = await computeVariableSignature();
    if (signature === lastVariableSignature) return;
    lastVariableSignature = signature;
    if (Date.now() < mutedUntil) return;
    figma.ui.postMessage({ type: "rozetta-document-changed", reason: "variable-poll" });
    logBridge("variable change detected by poll");
  } catch (error) {
    logBridge("variable poll failed", {
      message: error && error.message,
    });
  }
}

async function computeVariableSignature() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  const parts = [];
  for (const collection of collections) {
    parts.push("c:" + collection.id + ":" + collection.name + ":" + collection.modes.length);
    for (const mode of collection.modes) {
      parts.push("m:" + collection.id + ":" + mode.modeId + ":" + mode.name);
    }
  }
  for (const variable of variables) {
    parts.push(
      "v:" +
        variable.id +
        ":" +
        variable.name +
        ":" +
        variable.resolvedType +
        ":" +
        stableStringify(variable.valuesByMode)
    );
  }
  parts.sort();
  return parts.join("|");
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((entry) => stableStringify(entry)).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys.map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") +
    "}"
  );
}
