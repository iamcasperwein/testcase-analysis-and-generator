// --- Constants ---
const AGENTS = Object.freeze([
  { value: "litellm", label: "LiteLLM", description: "Unified LLM proxy (any provider)" },
  { value: "copilot", label: "GitHub Copilot", description: "GitHub Models via Copilot token" },
  // { value: "claude", label: "Claude", description: "Anthropic Claude model" },
  // { value: "gemini", label: "Gemini", description: "Google Gemini model" },
]);

const DOC_TYPES = Object.freeze([]); // Deprecated — doc types are now per-document row

const DEFAULT_AGENT = "litellm";
const DEFAULT_DOC_TYPE = "prd";

// --- Helper: simple fetch wrapper ---
async function apiRequest(url, options = {}) {
  const isAbsolute = /^https?:\/\//i.test(url);
  const normalizedPath = String(url || "").startsWith("/") ? String(url) : `/${String(url || "")}`;
  const backendPort = "9009";

  const candidates = [];
  if (isAbsolute) {
    candidates.push(url);
  } else {
    if (window.location.protocol === "file:") {
      candidates.push(`http://localhost:${backendPort}${normalizedPath}`);
    } else {
      candidates.push(normalizedPath);

      const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
      if (isLocalHost && window.location.port !== backendPort) {
        candidates.push(`http://localhost:${backendPort}${normalizedPath}`);
      }
    }
  }

  let lastError = null;

  for (const requestUrl of candidates) {
    try {
      const isFormData = options.body instanceof FormData;
      const response = await fetch(requestUrl, {
        headers: isFormData ? {} : {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        ...options,
      });

      const rawText = await response.text();
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const parsedBody = isJson && rawText ? JSON.parse(rawText) : (rawText || null);

      if (!response.ok) {
        const backendMessage =
          (parsedBody && typeof parsedBody === "object" && (parsedBody.error || parsedBody.message))
          || (typeof parsedBody === "string" ? parsedBody : "")
          || response.statusText;
        throw new Error(`${response.status} ${backendMessage}`.trim());
      }

      return parsedBody;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError?.message || "Failed to fetch API");
}

// --- GLOBAL BANNER ---
const appBanner      = document.getElementById("appBanner");
const appBannerMsg   = document.getElementById("appBannerMsg");
const appBannerIcon  = document.getElementById("appBannerIcon");
const appBannerClose = document.getElementById("appBannerClose");
let _bannerTimer = null;

function showBanner(message, type = "success") {
  clearTimeout(_bannerTimer);
  appBanner.classList.remove("banner-show", "banner-success", "banner-danger");
  appBannerMsg.textContent = String(message || "");
  appBannerIcon.className = type === "success"
    ? "bi bi-check-circle-fill"
    : "bi bi-exclamation-triangle-fill";
  void appBanner.offsetWidth; // force reflow for transition
  appBanner.classList.add("banner-show", type === "success" ? "banner-success" : "banner-danger");
  _bannerTimer = setTimeout(() => appBanner.classList.remove("banner-show"), 4000);
}

appBannerClose.addEventListener("click", () => {
  clearTimeout(_bannerTimer);
  appBanner.classList.remove("banner-show");
});

const pageBlockingOverlay = document.getElementById("pageBlockingOverlay");
const pageBlockingText = document.getElementById("pageBlockingText");

function setPageBlockingOverlay(isOpen, message = "Processing...") {
  if (!pageBlockingOverlay) return;
  if (pageBlockingText) {
    pageBlockingText.textContent = String(message || "Processing...");
  }
  pageBlockingOverlay.classList.toggle("open", Boolean(isOpen));
}

// --- SETTINGS CUSTOM DIALOGS ---
const settingEditOverlay     = document.getElementById("settingEditOverlay");
const settingEditKeyBadge    = document.getElementById("settingEditKeyBadge");
const settingEditInput       = document.getElementById("settingEditInput");
const settingEditCancelBtn   = document.getElementById("settingEditCancelBtn");
const settingEditConfirmBtn  = document.getElementById("settingEditConfirmBtn");

const settingDeleteOverlay    = document.getElementById("settingDeleteOverlay");
const settingDeleteKeyBadge   = document.getElementById("settingDeleteKeyBadge");
const settingDeleteCancelBtn  = document.getElementById("settingDeleteCancelBtn");
const settingDeleteConfirmBtn = document.getElementById("settingDeleteConfirmBtn");

function openSettingEditDialog(key, currentValue) {
  return new Promise((resolve) => {
    settingEditKeyBadge.textContent = key;
    settingEditInput.value = currentValue;
    settingEditOverlay.classList.add("open");
    setTimeout(() => settingEditInput.focus(), 50);

    const cleanup = () => {
      settingEditOverlay.classList.remove("open");
      settingEditConfirmBtn.removeEventListener("click", onConfirm);
      settingEditCancelBtn.removeEventListener("click", onCancel);
      settingEditOverlay.removeEventListener("click", onBackdrop);
      settingEditInput.removeEventListener("keydown", onKeydown);
    };

    const onConfirm = () => { cleanup(); resolve(settingEditInput.value); };
    const onCancel  = () => { cleanup(); resolve(null); };
    const onBackdrop = (e) => { if (e.target === settingEditOverlay) onCancel(); };
    const onKeydown  = (e) => {
      if (e.key === "Enter") onConfirm();
      if (e.key === "Escape") onCancel();
    };

    settingEditConfirmBtn.addEventListener("click", onConfirm);
    settingEditCancelBtn.addEventListener("click", onCancel);
    settingEditOverlay.addEventListener("click", onBackdrop);
    settingEditInput.addEventListener("keydown", onKeydown);
  });
}

function openSettingDeleteDialog(key) {
  return new Promise((resolve) => {
    settingDeleteKeyBadge.textContent = key;
    settingDeleteOverlay.classList.add("open");

    const cleanup = () => {
      settingDeleteOverlay.classList.remove("open");
      settingDeleteConfirmBtn.removeEventListener("click", onConfirm);
      settingDeleteCancelBtn.removeEventListener("click", onCancel);
      settingDeleteOverlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
    };

    const onConfirm  = () => { cleanup(); resolve(true); };
    const onCancel   = () => { cleanup(); resolve(false); };
    const onBackdrop = (e) => { if (e.target === settingDeleteOverlay) onCancel(); };
    const onKeydown  = (e) => { if (e.key === "Escape") onCancel(); };

    settingDeleteConfirmBtn.addEventListener("click", onConfirm);
    settingDeleteCancelBtn.addEventListener("click", onCancel);
    settingDeleteOverlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

const appLayout = document.querySelector(".app-layout");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const sectionPanelToggleBtn = document.getElementById("sectionPanelToggleBtn");
const testScopeLeftPanel = document.querySelector(".test-scope-left");

function setSidebarCollapsed(isCollapsed) {
  appLayout.classList.toggle("sidebar-collapsed", isCollapsed);
  sidebarToggleBtn.setAttribute("aria-label", isCollapsed ? "Expand sidebar" : "Collapse sidebar");
  sidebarToggleBtn.setAttribute("title", isCollapsed ? "Expand sidebar" : "Collapse sidebar");
  sidebarToggleBtn.innerHTML = isCollapsed
    ? '<i class="bi bi-layout-sidebar"></i>'
    : '<i class="bi bi-layout-sidebar-inset"></i>';
  localStorage.setItem("qa_sidebar_collapsed", isCollapsed ? "1" : "0");
}

function setSectionPanelCollapsed(isCollapsed) {
  if (!testScopeLeftPanel) return;
  testScopeLeftPanel.classList.toggle("is-collapsed", isCollapsed);
  sectionPanelToggleBtn.setAttribute("aria-label", isCollapsed ? "Expand sections" : "Collapse sections");
  sectionPanelToggleBtn.setAttribute("title", isCollapsed ? "Expand sections" : "Collapse sections");
  sectionPanelToggleBtn.innerHTML = isCollapsed
    ? '<i class="bi bi-chevron-right"></i>'
    : '<i class="bi bi-chevron-left"></i>';
  localStorage.setItem("qa_sections_collapsed", isCollapsed ? "1" : "0");
}

sidebarToggleBtn.addEventListener("click", () => {
  setSidebarCollapsed(!appLayout.classList.contains("sidebar-collapsed"));
});

sectionPanelToggleBtn.addEventListener("click", () => {
  setSectionPanelCollapsed(!testScopeLeftPanel.classList.contains("is-collapsed"));
});

setSidebarCollapsed(localStorage.getItem("qa_sidebar_collapsed") === "1");
setSectionPanelCollapsed(localStorage.getItem("qa_sections_collapsed") === "1");

// --- FORM: Submit to /generate/ask ---
const qaForm = document.getElementById("qaForm");
const formStatus = document.getElementById("formStatus");
const submitFormBtn = document.getElementById("submitFormBtn");

function createStaticOptionSelect({ wrapId, triggerId, triggerTextId, dropdownId, searchId, optionsId, valueId, options = [] }) {
  const wrapEl = document.getElementById(wrapId);
  const triggerEl = document.getElementById(triggerId);
  const triggerTextEl = document.getElementById(triggerTextId);
  const dropdownEl = document.getElementById(dropdownId);
  const searchEl = document.getElementById(searchId);
  const optionsEl = document.getElementById(optionsId);
  const valueEl = document.getElementById(valueId);

  let safeOptions = Array.isArray(options) ? options : [];

  function closeDropdown() {
    dropdownEl.classList.remove("open");
    triggerEl.classList.remove("open");
  }

  function setSelection(value) {
    const item = safeOptions.find((option) => option.value === value) || safeOptions[0] || { value: "", label: "" };
    const previousValue = valueEl.value;
    valueEl.value = item.value;
    triggerTextEl.textContent = item.label || item.value || "";
    triggerTextEl.classList.toggle("is-placeholder", !item.label && !item.value);

    if (previousValue !== item.value) {
      valueEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function renderOptions(filter = "") {
    const q = String(filter || "").trim().toLowerCase();
    const filtered = safeOptions.filter((item) => String(item.label || item.value || "").toLowerCase().includes(q));

    optionsEl.innerHTML = "";
    if (!filtered.length) {
      optionsEl.innerHTML = '<div class="prompt-select-no-results">No options found.</div>';
      return;
    }

    filtered.forEach((item) => {
      const isSelected = valueEl.value === item.value;
      const optionEl = document.createElement("div");
      optionEl.className = `prompt-select-option${isSelected ? " selected" : ""}`;
      optionEl.innerHTML = `
        <span class="prompt-select-option-id">${item.label || item.value}</span>
        <span class="prompt-select-option-name">${item.description || ""}</span>
      `;

      optionEl.addEventListener("mousedown", (event) => {
        event.preventDefault();
        setSelection(item.value);
        closeDropdown();
      });

      optionsEl.appendChild(optionEl);
    });
  }

  triggerEl.addEventListener("click", () => {
    const isOpen = dropdownEl.classList.contains("open");
    if (isOpen) {
      closeDropdown();
      return;
    }

    dropdownEl.classList.add("open");
    triggerEl.classList.add("open");
    searchEl.value = "";
    renderOptions("");
    searchEl.focus();
  });

  triggerEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      triggerEl.click();
    }
  });

  searchEl.addEventListener("input", () => renderOptions(searchEl.value));
  searchEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDropdown();
    }
  });

  document.addEventListener("click", (event) => {
    if (!wrapEl.contains(event.target)) {
      closeDropdown();
    }
  });

  setSelection(valueEl.value || safeOptions[0]?.value || "");
  renderOptions("");

  return {
    getValue() {
      return String(valueEl.value || "").trim();
    },
    setOptions(newOptions) {
      safeOptions = Array.isArray(newOptions) ? newOptions : [];
      const currentValue = valueEl.value;
      const stillExists = safeOptions.some((o) => o.value === currentValue);
      if (!stillExists) {
        setSelection(safeOptions[0]?.value || "");
      } else {
        renderOptions("");
        // Update trigger text in case label changed
        const match = safeOptions.find((o) => o.value === currentValue);
        if (match) triggerTextEl.textContent = match.label || match.value || "";
      }
    },
    setLoading(msg) {
      triggerTextEl.textContent = msg || "Loading...";
      triggerTextEl.classList.add("is-placeholder");
      safeOptions = [];
      optionsEl.innerHTML = "";
      valueEl.value = "";
    },
    setSelection(value) {
      setSelection(value);
    },
  };
}

const agentPicker = createStaticOptionSelect({
  wrapId: "agentSelectWrap",
  triggerId: "agentTrigger",
  triggerTextId: "agentTriggerText",
  dropdownId: "agentDropdown",
  searchId: "agentSearch",
  optionsId: "agentOptions",
  valueId: "agentValueInput",
  options: AGENTS,
});

// --- Model Picker (dynamic, populated based on agent selection) ---
const modelPicker = createStaticOptionSelect({
  wrapId: "modelSelectWrap",
  triggerId: "modelTrigger",
  triggerTextId: "modelTriggerText",
  dropdownId: "modelDropdown",
  searchId: "modelSearch",
  optionsId: "modelOptions",
  valueId: "modelValueInput",
  options: [],
});

let _modelLoadAbort = null;

async function loadModelsForAgent(agent) {
  const normalizedAgent = String(agent || "").trim().toLowerCase();
  if (!normalizedAgent) {
    modelPicker.setOptions([]);
    return;
  }

  // Abort previous in-flight request
  if (_modelLoadAbort) {
    _modelLoadAbort.abort();
    _modelLoadAbort = null;
  }

  modelPicker.setLoading("Loading models...");

  const controller = new AbortController();
  _modelLoadAbort = controller;

  try {
    const resp = await apiRequest(`/settings/models?agent=${encodeURIComponent(normalizedAgent)}`, {
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;

    const data = resp?.data ?? resp ?? {};
    const models = Array.isArray(data.models) ? data.models : [];

    if (!models.length) {
      modelPicker.setOptions([{ value: "", label: data.message || "No models available" }]);
      return;
    }

    const options = models.map((m) => ({
      value: String(m.id || "").trim(),
      label: String(m.name || m.id || "").trim(),
      description: m.summary || "",
    }));

    modelPicker.setOptions(options);
  } catch (err) {
    if (err.name === "AbortError") return;
    modelPicker.setOptions([{ value: "", label: "Failed to load models" }]);
  } finally {
    if (_modelLoadAbort === controller) _modelLoadAbort = null;
  }
}

// Listen for agent changes → reload models
document.getElementById("agentValueInput").addEventListener("change", () => {
  loadModelsForAgent(agentPicker.getValue());
});

// Initial load
loadModelsForAgent(agentPicker.getValue());

// docTypePicker removed — doc type is now per document row
const docTypePicker = { getValue: () => DEFAULT_DOC_TYPE };

// --- Platform Multiselect ---
const PLATFORM_OPTIONS = [
  { value: "app", label: "App", icon: "bi-phone", platforms: ["ios", "android"] },
  { value: "mobile-web", label: "Mobile Web", icon: "bi-globe2", platforms: ["mobile-web"] },
  { value: "desktop-web", label: "Desktop Web", icon: "bi-display", platforms: ["desktop-web"] },
  { value: "backend", label: "Backend", icon: "bi-hdd-rack", platforms: ["backend"] },
];

// Granular platform options for edit modal — these are the actual values stored on test cases
const EDIT_PLATFORM_OPTIONS = [
  { value: "ios", label: "iOS", icon: "bi-apple" },
  { value: "android", label: "Android", icon: "bi-android2" },
  { value: "mobile-web", label: "Mobile Web", icon: "bi-globe2" },
  { value: "desktop-web", label: "Desktop Web", icon: "bi-display" },
  { value: "backend", label: "Backend", icon: "bi-hdd-rack" },
];

// Expand filter values (e.g. "app") to actual platform strings (e.g. ["ios", "android"])
function expandPlatformFilter(filterSet) {
  const expanded = new Set();
  filterSet.forEach(val => {
    const opt = PLATFORM_OPTIONS.find(o => o.value === val);
    if (opt && opt.platforms) {
      opt.platforms.forEach(p => expanded.add(p));
    } else {
      expanded.add(val);
    }
  });
  return expanded;
}

// Derive which PLATFORM_OPTIONS are relevant based on a prompt's granular platforms array
function getAvailablePlatformGroups(promptPlatforms) {
  if (!Array.isArray(promptPlatforms) || !promptPlatforms.length) return [...PLATFORM_OPTIONS];
  const normalizedSet = new Set(promptPlatforms.map(p => String(p || "").trim().toLowerCase()).filter(Boolean));
  return PLATFORM_OPTIONS.filter(opt =>
    opt.platforms.some(p => normalizedSet.has(p))
  );
}

// Frontend mirror of backend hasPostedToTestrail — checks per-platform-group format with legacy fallback
function hasPostedToTestrailFrontend(tc, platformGroup) {
  const tp = tc?.testrailPost;
  if (!tp || typeof tp !== "object") return false;

  // New per-platform-group format: no root .status means it's a group map
  if (platformGroup && !tp.status) {
    const groupPost = tp[platformGroup];
    if (!groupPost) return false;
    return groupPost.status === "success" || groupPost.testrailCaseId != null;
  }

  // Legacy single-object format
  return tp.status === "success" || tp.testrailCaseId != null;
}

// Get the relevant testrailPost data for display, considering active platform group
function getTestrailPostForDisplay(tc) {
  const tp = tc?.testrailPost;
  if (!tp || typeof tp !== "object") return null;

  // Per-platform-group format: no root .status
  if (!tp.status && typeof tp === "object") {
    // If a platform filter is active, show that group's data
    if (selectedPlatformFilters.size === 1) {
      const groupKey = [...selectedPlatformFilters][0];
      return tp[groupKey] || null;
    }
    // No filter: find any posted group
    for (const key of Object.keys(tp)) {
      if (tp[key]?.status === "success") return tp[key];
    }
    return null;
  }

  // Legacy format
  return tp;
}

// Get list of platform group keys that have been successfully posted
function getPostedPlatformGroups(tc) {
  const tp = tc?.testrailPost;
  if (!tp || typeof tp !== "object") return [];
  // Per-platform-group format
  if (!tp.status) {
    return Object.keys(tp).filter(k => tp[k]?.status === "success");
  }
  return [];
}


/**
 * Get section name from a section group, optionally for a specific platform.
 */
function getSectionGroupName(group, platformGroup) {
  const sec = group?.section;
  if (sec == null || typeof sec !== "object" || Array.isArray(sec)) return "Uncategorized";
  if (platformGroup && sec[platformGroup]) {
    return String(sec[platformGroup].name || "").trim() || "Uncategorized";
  }
  if (sec._default) {
    return String(sec._default.name || "").trim() || "Uncategorized";
  }
  const firstKey = Object.keys(sec).find(k => sec[k]?.name);
  return firstKey ? String(sec[firstKey].name || "").trim() || "Uncategorized" : "Uncategorized";
}

/**
 * Get the raw section object from a section group for storage on TCs.
 */
function getRawSectionData(group) {
  return group?.section || {};
}

/**
 * Resolve section name + metadata from raw section data for a given platform group.
 */
function resolveSectionData(rawSection, platformGroup) {
  if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) {
    return { name: "Uncategorized", sectionId: null, suiteId: null, sectionSource: "ai" };
  }
  const entry = (platformGroup && rawSection[platformGroup]) || rawSection._default || null;
  if (entry) {
    return {
      name: String(entry.name || "").trim() || "Uncategorized",
      sectionId: entry.sectionId ?? null,
      suiteId: entry.suiteId ?? null,
      sectionSource: String(entry.sectionSource || "").trim().toLowerCase() || "ai",
    };
  }
  const firstKey = Object.keys(rawSection).find(k => rawSection[k]?.name);
  if (firstKey) {
    const e = rawSection[firstKey];
    return {
      name: String(e.name || "").trim() || "Uncategorized",
      sectionId: e.sectionId ?? null,
      suiteId: e.suiteId ?? null,
      sectionSource: String(e.sectionSource || "").trim().toLowerCase() || "ai",
    };
  }
  return { name: "Uncategorized", sectionId: null, suiteId: null, sectionSource: "ai" };
}

function getActivePlatformGroup() {
  if (selectedPlatformFilters.size === 1) {
    return [...selectedPlatformFilters][0];
  }
  return null;
}

// Check if any platform group has sectionSource "testrail" on a section group's raw section data
function hasAnyTestrailSource(rawSection) {
  if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) return false;
  return Object.values(rawSection).some(entry =>
    entry && String(entry.sectionSource || "").toLowerCase() === "testrail"
  );
}

// --- Form Platform Options (granular — no "app" group) ---
const FORM_PLATFORM_OPTIONS = [
  { value: "ios", label: "iOS", icon: "bi-apple" },
  { value: "android", label: "Android", icon: "bi-android2" },
  { value: "mobile-web", label: "Mobile Web", icon: "bi-globe2" },
  { value: "desktop-web", label: "Desktop Web", icon: "bi-display" },
  { value: "backend", label: "Backend", icon: "bi-hdd-rack" },
];

const platformValueInput = document.getElementById("platformValueInput");
const platformSelectWrap = document.getElementById("platformSelectWrap");
const platformTrigger = document.getElementById("platformTrigger");
const platformTriggerText = document.getElementById("platformTriggerText");
const platformDropdownPanel = document.getElementById("platformDropdownPanel");
const platformSearchInput = document.getElementById("platformSearch");
const platformOptionsPanel = document.getElementById("platformOptionsPanel");
const platformChipsSelected = document.getElementById("platformChipsSelected");
let selectedPlatforms = new Set();

function syncPlatformHiddenInput() {
  platformValueInput.value = Array.from(selectedPlatforms).join(",");
}

function closePlatformDropdown() {
  platformDropdownPanel.classList.remove("open");
  platformTrigger.classList.remove("open");
}

function renderPlatformOptions(filter = "") {
  if (!platformOptionsPanel) return;
  const q = String(filter || "").trim().toLowerCase();
  const available = FORM_PLATFORM_OPTIONS.filter(opt =>
    !selectedPlatforms.has(opt.value) &&
    String(opt.label || "").toLowerCase().includes(q)
  );
  platformOptionsPanel.innerHTML = "";
  if (!available.length) {
    platformOptionsPanel.innerHTML = '<div class="prompt-select-no-results">No platforms available.</div>';
    return;
  }
  available.forEach(opt => {
    const el = document.createElement("div");
    el.className = "prompt-select-option";
    el.innerHTML = `<span class="prompt-select-option-id"><i class="bi ${opt.icon} me-1"></i>${escapeHtml(opt.label)}</span>`;
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectedPlatforms.add(opt.value);
      renderSelectedPlatformChips();
      renderPlatformTriggerText();
      syncPlatformHiddenInput();
      closePlatformDropdown();
    });
    platformOptionsPanel.appendChild(el);
  });
}

function renderPlatformTriggerText() {
  if (!platformTriggerText) return;
  const remaining = FORM_PLATFORM_OPTIONS.length - selectedPlatforms.size;
  if (remaining === 0) {
    platformTriggerText.textContent = "All platforms selected";
    platformTriggerText.classList.remove("is-placeholder");
  } else {
    platformTriggerText.textContent = "Select a platform...";
    platformTriggerText.classList.add("is-placeholder");
  }
}

function renderSelectedPlatformChips() {
  if (!platformChipsSelected) return;
  platformChipsSelected.innerHTML = "";
  FORM_PLATFORM_OPTIONS.forEach(opt => {
    if (!selectedPlatforms.has(opt.value)) return;
    const chip = document.createElement("span");
    chip.className = "platform-chip-selected";
    chip.innerHTML = `<i class="bi ${opt.icon}"></i> ${escapeHtml(opt.label)} <button type="button" class="platform-chip-remove" aria-label="Remove">&times;</button>`;
    chip.querySelector(".platform-chip-remove").addEventListener("click", () => {
      selectedPlatforms.delete(opt.value);
      renderSelectedPlatformChips();
      renderPlatformTriggerText();
      syncPlatformHiddenInput();
    });
    platformChipsSelected.appendChild(chip);
  });
}

if (platformTrigger) {
  platformTrigger.addEventListener("click", () => {
    const isOpen = platformDropdownPanel.classList.contains("open");
    if (isOpen) { closePlatformDropdown(); return; }
    platformDropdownPanel.classList.add("open");
    platformTrigger.classList.add("open");
    platformSearchInput.value = "";
    renderPlatformOptions("");
    platformSearchInput.focus();
  });
  platformTrigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); platformTrigger.click(); }
  });
}
if (platformSearchInput) {
  platformSearchInput.addEventListener("input", () => renderPlatformOptions(platformSearchInput.value));
  platformSearchInput.addEventListener("keydown", (e) => { if (e.key === "Escape") closePlatformDropdown(); });
}
if (platformSelectWrap) {
  document.addEventListener("click", (e) => {
    if (!platformSelectWrap.contains(e.target)) closePlatformDropdown();
  });
}

// Initialize with all platforms selected by default
FORM_PLATFORM_OPTIONS.forEach(opt => selectedPlatforms.add(opt.value));
renderSelectedPlatformChips();
renderPlatformTriggerText();
syncPlatformHiddenInput();

// --- Context Toggle ---
const contextToggleBtn = document.getElementById("contextToggleBtn");
const contextCollapsible = document.getElementById("contextCollapsible");
if (contextToggleBtn && contextCollapsible) {
  contextToggleBtn.addEventListener("click", () => {
    const isOpen = contextCollapsible.style.display !== "none";
    contextCollapsible.style.display = isOpen ? "none" : "block";
    contextToggleBtn.classList.toggle("is-open", !isOpen);
    contextToggleBtn.innerHTML = isOpen
      ? '<i class="bi bi-plus-circle me-1"></i>Add context / notes for AI'
      : '<i class="bi bi-dash-circle me-1"></i>Hide context / notes';
    if (!isOpen) {
      contextCollapsible.querySelector("textarea")?.focus();
    }
  });
}

const additionalDocsList = document.getElementById("additionalDocsList");
const addDocBtn = document.getElementById("addDocBtn");
const additionalDocHelper = document.getElementById("additionalDocHelper");

// DOC_TYPES fetched from backend for centralized config
let DOC_TYPE_OPTIONS = [
  { value: "PRD", label: "PRD", description: "Product Requirements Document" },
  { value: "RFC", label: "RFC", description: "Request for Comments / Technical Spec" },
  { value: "FIGMA", label: "Figma", description: "Figma design export or screenshot" },
  { value: "API_CONTRACT", label: "API Contract", description: "API specification" },
  { value: "USER_STORY", label: "User Story", description: "User story or acceptance criteria" },
  { value: "ARCHITECTURE", label: "Architecture Doc", description: "System architecture document" },
  { value: "TEST_PLAN", label: "Test Plan", description: "Existing test plan or strategy" },
  { value: "RELEASE_NOTE", label: "Release Note", description: "Release notes or changelog" },
  { value: "OTHER", label: "Other", description: "Other supporting document" },
];

// Fetch DOC_TYPES from backend (non-blocking, falls back to hardcoded defaults)
(async () => {
  try {
    const response = await apiRequest("/settings/doc-types");
    if (Array.isArray(response?.data)) {
      DOC_TYPE_OPTIONS = response.data.map((dt) => ({
        value: dt.value,
        label: dt.label,
        description: dt.description || "",
      }));
    }
  } catch (_) {
    // Use hardcoded defaults
  }
})();

let additionalDocRowSequence = 0;

function updateAdditionalDocHelper() {
  if (!additionalDocHelper) return;
  const hasRows = Boolean(additionalDocsList?.querySelector(".additional-doc-row"));
  additionalDocHelper.classList.toggle("is-hidden", hasRows);
}

function createAdditionalDocRow(defaultDocType = null) {
  const rowId = ++additionalDocRowSequence;
  const row = document.createElement("div");
  row.className = "additional-doc-row";
  row.dataset.rowId = String(rowId);
  const valueId = `addDocTypeValue-${rowId}`;
  const wrapId = `addDocTypeWrap-${rowId}`;
  const triggerId = `addDocTypeTrigger-${rowId}`;
  const triggerTextId = `addDocTypeTriggerText-${rowId}`;
  const dropdownId = `addDocTypeDropdown-${rowId}`;
  const searchId = `addDocTypeSearch-${rowId}`;
  const optionsId = `addDocTypeOptions-${rowId}`;

  // Format dropdown IDs
  const fmtValueId = `addDocFormatValue-${rowId}`;
  const fmtWrapId = `addDocFormatWrap-${rowId}`;
  const fmtTriggerId = `addDocFormatTrigger-${rowId}`;
  const fmtTriggerTextId = `addDocFormatTriggerText-${rowId}`;
  const fmtDropdownId = `addDocFormatDropdown-${rowId}`;
  const fmtSearchId = `addDocFormatSearch-${rowId}`;
  const fmtOptionsId = `addDocFormatOptions-${rowId}`;

  // Determine default type: use provided default, or PRD for first row, else RFC
  const existingRows = additionalDocsList?.querySelectorAll(".additional-doc-row") || [];
  const initialType = defaultDocType || (existingRows.length === 0 ? "PRD" : "RFC");
  const initialLabel = DOC_TYPE_OPTIONS.find((o) => o.value === initialType)?.label || initialType;

  row.innerHTML = `
    <div class="additional-doc-row-grid">
      <div class="add-doc-col-type">
        <label class="add-doc-label">Type</label>
        <div class="prompt-select-wrap add-doc-type-wrap" id="${wrapId}">
          <div class="prompt-select-trigger" id="${triggerId}" tabindex="0">
            <span class="prompt-select-trigger-text" id="${triggerTextId}">${initialLabel}</span>
            <i class="bi bi-chevron-down" style="font-size:0.75rem;flex-shrink:0;"></i>
          </div>
          <div class="prompt-select-dropdown" id="${dropdownId}">
            <input type="text" class="prompt-select-search" id="${searchId}" placeholder="Search type..." autocomplete="off" />
            <div class="prompt-select-options" id="${optionsId}"></div>
          </div>
        </div>
        <input type="hidden" id="${valueId}" class="add-doc-type-value" value="${initialType}" />
      </div>
      <div class="add-doc-col-format">
        <label class="add-doc-label">Format</label>
        <div class="prompt-select-wrap add-doc-format-wrap" id="${fmtWrapId}">
          <div class="prompt-select-trigger" id="${fmtTriggerId}" tabindex="0">
            <span class="prompt-select-trigger-text" id="${fmtTriggerTextId}">Lark Link</span>
            <i class="bi bi-chevron-down" style="font-size:0.75rem;flex-shrink:0;"></i>
          </div>
          <div class="prompt-select-dropdown" id="${fmtDropdownId}">
            <input type="text" class="prompt-select-search" id="${fmtSearchId}" placeholder="Search..." autocomplete="off" />
            <div class="prompt-select-options" id="${fmtOptionsId}"></div>
          </div>
        </div>
        <input type="hidden" id="${fmtValueId}" class="add-doc-format-value" value="link" />
      </div>
      <div class="add-doc-col-input">
        <label class="add-doc-label add-doc-input-label">URL</label>
        <div class="add-doc-file-wrap" style="display:none;">
          <input type="file" class="form-control form-control-sm add-doc-file" accept=".txt,.md,.pdf,.doc,.docx,.json,.csv,.png,.jpg,.jpeg" />
        </div>
        <div class="add-doc-link-wrap">
          <input type="url" class="form-control form-control-sm add-doc-link-url" placeholder="https://xxx.larksuite.com/docx/..." />
          <div class="add-doc-link-error text-danger" style="font-size:0.72rem;margin-top:2px;display:none;"></div>
        </div>
      </div>
      <div class="add-doc-col-action">
        <button type="button" class="btn btn-sm btn-outline-danger remove-doc-btn" title="Remove document">
          <i class="bi bi-trash3"></i>
        </button>
      </div>
    </div>
  `;

  additionalDocsList.appendChild(row);

  // Initialize doc type dropdown
  createStaticOptionSelect({
    wrapId,
    triggerId,
    triggerTextId,
    dropdownId,
    searchId,
    optionsId,
    valueId,
    options: DOC_TYPE_OPTIONS,
  });

  // Initialize format dropdown
  const DOC_FORMAT_OPTIONS = [
    { value: "link", label: "Lark Link", description: "Paste a Lark document or wiki URL" },
    { value: "file", label: "File Upload", description: "Upload a file (PDF, TXT, MD, etc.)" },
  ];
  createStaticOptionSelect({
    wrapId: fmtWrapId,
    triggerId: fmtTriggerId,
    triggerTextId: fmtTriggerTextId,
    dropdownId: fmtDropdownId,
    searchId: fmtSearchId,
    optionsId: fmtOptionsId,
    valueId: fmtValueId,
    options: DOC_FORMAT_OPTIONS,
  });

  const typeValueInput = row.querySelector(".add-doc-type-value");
  const formatValueInput = row.querySelector(".add-doc-format-value");
  const fileWrap = row.querySelector(".add-doc-file-wrap");
  const linkWrap = row.querySelector(".add-doc-link-wrap");
  const fileInput = row.querySelector(".add-doc-file");
  const linkInput = row.querySelector(".add-doc-link-url");
  const linkError = row.querySelector(".add-doc-link-error");
  const inputLabel = row.querySelector(".add-doc-input-label");
  const removeButton = row.querySelector(".remove-doc-btn");

  // Format toggle: show file input or link input
  const syncFormatVisibility = () => {
    const format = formatValueInput.value;
    if (format === "link") {
      fileWrap.style.display = "none";
      linkWrap.style.display = "";
      inputLabel.textContent = "Link URL";
      // Clear file when switching to link
      fileInput.value = "";
    } else {
      fileWrap.style.display = "";
      linkWrap.style.display = "none";
      inputLabel.textContent = "File";
      // Clear link when switching to file
      linkInput.value = "";
      linkError.style.display = "none";
    }
  };

  // Lark URL validation — keep in sync with constants/api/LarkApi.js URL_PATTERNS
  const LARK_URL_REGEX = /^https?:\/\/[\w-]+(?:\.[\w-]+)*\.(larksuite\.com|feishu\.cn)\/(docx|wiki)\/[\w-]+/i;
  const validateLarkUrl = () => {
    const url = linkInput.value.trim();
    if (!url) {
      linkError.style.display = "none";
      return true; // empty is handled by submit validation
    }
    if (!LARK_URL_REGEX.test(url)) {
      linkError.textContent = "Only valid Lark doc/wiki URLs are accepted (e.g. https://xxx.larksuite.com/docx/...)";
      linkError.style.display = "";
      return false;
    }
    linkError.style.display = "none";
    return true;
  };

  formatValueInput.addEventListener("change", syncFormatVisibility);
  linkInput.addEventListener("blur", validateLarkUrl);
  linkInput.addEventListener("input", () => {
    if (linkError.style.display !== "none") validateLarkUrl();
  });

  removeButton?.addEventListener("click", () => {
    row.remove();
    updateAdditionalDocHelper();
  });

  syncFormatVisibility();
  updateAdditionalDocHelper();
}

addDocBtn?.addEventListener("click", () => createAdditionalDocRow());
// Create initial PRD row on page load
createAdditionalDocRow("PRD");
updateAdditionalDocHelper();

qaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formStatus.textContent = "";
  submitFormBtn.disabled = true;
  submitFormBtn.textContent = "Submitting...";

  // Collect all document rows
  const docRows = Array.from(document.querySelectorAll(".additional-doc-row"));
  const docEntries = [];
  // Keep in sync with constants/api/LarkApi.js URL_PATTERNS
  const LARK_URL_REGEX = /^https?:\/\/[\w-]+(?:\.[\w-]+)*\.(larksuite\.com|feishu\.cn)\/(docx|wiki)\/[\w-]+/i;

  let validationError = "";
  for (const row of docRows) {
    const format = row.querySelector(".add-doc-format-value")?.value || "file";
    const docType = row.querySelector(".add-doc-type-value")?.value || "OTHER";

    if (format === "link") {
      const linkUrl = row.querySelector(".add-doc-link-url")?.value?.trim() || "";
      if (!linkUrl) {
        validationError = `${docType} document: Link URL is required.`;
        break;
      }
      if (!LARK_URL_REGEX.test(linkUrl)) {
        validationError = `${docType} document: Invalid Lark URL. Only Lark doc/wiki URLs are supported.`;
        break;
      }
      docEntries.push({ format: "link", docType, docName: `${docType} (link)`, linkUrl, file: null });
    } else {
      const file = row.querySelector(".add-doc-file")?.files?.[0] || null;
      if (!file) continue; // skip empty file rows
      docEntries.push({ format: "file", docType, docName: file.name, linkUrl: "", file });
    }
  }

  if (validationError) {
    formStatus.textContent = validationError;
    formStatus.classList.remove("text-success");
    formStatus.classList.add("text-danger");
    submitFormBtn.disabled = false;
    submitFormBtn.textContent = "Submit";
    return;
  }

  // Validate: at least one PRD document
  const hasPrd = docEntries.some((d) => d.docType === "PRD");
  if (!hasPrd) {
    formStatus.textContent = "At least one PRD document (file or link) is required.";
    formStatus.classList.remove("text-success");
    formStatus.classList.add("text-danger");
    submitFormBtn.disabled = false;
    submitFormBtn.textContent = "Submit";
    return;
  }

  // At least one platform is required
  if (selectedPlatforms.size === 0) {
    formStatus.textContent = "At least one target platform is required.";
    formStatus.classList.remove("text-success");
    formStatus.classList.add("text-danger");
    submitFormBtn.disabled = false;
    submitFormBtn.textContent = "Submit";
    return;
  }

  // Build multipart FormData
  const formData = new FormData();
  formData.append("agent", agentPicker.getValue() || DEFAULT_AGENT);
  formData.append("model", modelPicker.getValue() || "");
  formData.append("projectName", document.getElementById("projectNameInput").value.trim());
  formData.append("feature", document.getElementById("projectNameInput").value.trim());
  formData.append("platforms", Array.from(selectedPlatforms).join(","));
  formData.append("context", document.getElementById("contextInput")?.value?.trim() || "");

  // Documents: parallel arrays for docTypes, docFormats, docLinkUrls
  // Files go under "documents" field (only for format=file entries)
  for (const entry of docEntries) {
    formData.append("docTypes", entry.docType);
    formData.append("docNames", entry.docName);
    formData.append("docFormats", entry.format);
    formData.append("docLinkUrls", entry.linkUrl || "");
    if (entry.format === "file" && entry.file) {
      formData.append("documents", entry.file);
    }
  }

  try {
    const response = await apiRequest("/generate/ask", {
      method: "POST",
      headers: {}, // let browser set multipart boundary automatically
      body: formData,
    });

    const generatedPromptId = response?.data?.promptId || "";

    const bannerMsg = generatedPromptId
      ? `Submitted successfully. Prompt ID: ${generatedPromptId}`
      : "Submitted successfully.";
    formStatus.textContent = bannerMsg;
    formStatus.classList.remove("text-danger");
    formStatus.classList.add("text-success");
    showBanner(bannerMsg, "success");

    if (generatedPromptId) {
      await loadAllPrompts();
      await loadDashboard();
    }
  } catch (err) {
    formStatus.textContent = "Submission failed: " + err.message;
    formStatus.classList.remove("text-success");
    formStatus.classList.add("text-danger");
    showBanner("Submission failed: " + err.message, "danger");
  } finally {
    submitFormBtn.disabled = false;
    submitFormBtn.textContent = "Submit for Analysis";
  }
});

// --- TEST ANALYSIS: /testcase/getAnalyzeResult/{promptID} ---
const downloadAnalysisBtn = document.getElementById("downloadAnalysisBtn");
const analysisPromptIdInput = document.getElementById("analysisPromptIdInput");
const analysisStatus = document.getElementById("analysisStatus");
const analysisToc = document.getElementById("analysisToc");
const analysisDoc = document.getElementById("analysisDoc");

let currentAnalysisPromptId = null;
let currentAnalysisText = "";

async function doLoadAnalysis(promptId) {
  if (!promptId) {
    analysisStatus.textContent = "Select a prompt to load analysis.";
    return;
  }

  analysisStatus.textContent = "Loading analysis...";
  downloadAnalysisBtn.disabled = true;
  currentAnalysisPromptId = promptId;
  currentAnalysisText = "";

  try {
    const response = await apiRequest(`/testcase/getAnalyzeResult/${encodeURIComponent(promptId)}`);
    const payload = response && typeof response === "object" && response.data ? response.data : response;
    currentAnalysisText = typeof payload?.analysis === "string" ? payload.analysis : "";

    renderAnalysisDocument(currentAnalysisText);

    analysisStatus.textContent = "Analysis loaded.";
    downloadAnalysisBtn.disabled = !currentAnalysisText.trim();
  } catch (err) {
    analysisToc.innerHTML = '<div class="analysis-toc-title">Contents</div><div class="analysis-toc-empty text-danger">Failed to load sections.</div>';
    analysisDoc.innerHTML = '<div class="analysis-doc-empty text-danger">Failed to load analysis.</div>';
    analysisStatus.textContent = err.message;
    downloadAnalysisBtn.disabled = true;
  }
}

function parseAnalysisSections(rawText) {
  const lines = String(rawText || "").replace(/\r\n?/g, "\n").split("\n");
  const parsedSections = [];
  let currentSection = null;
  const introLines = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    const hasLeadingWhitespace = /^\s+/.test(line);

    // Match markdown headings: ## 1. Title or ### 2.1 Title
    const mdHeadingMatch = trimmed.match(/^(#{1,6})\s+(\d+(?:\.\d+)*)\.?\s+(.+)$/);
    if (mdHeadingMatch && !hasLeadingWhitespace) {
      currentSection = {
        numbering: mdHeadingMatch[2],
        title: mdHeadingMatch[3].replace(/\s*\*+$/g, "").trim(),
        level: mdHeadingMatch[2].split(".").length,
        lines: [],
      };
      parsedSections.push(currentSection);
      return;
    }

    // Match plain numbered lines: 1. Title or 2.1 Title
    const headingMatch = trimmed.match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/);
    if (headingMatch && !hasLeadingWhitespace) {
      currentSection = {
        numbering: headingMatch[1],
        title: headingMatch[2].trim(),
        level: headingMatch[1].split(".").length,
        lines: [],
      };
      parsedSections.push(currentSection);
      return;
    }

    // Match markdown headings without numbering: ## Title
    const mdPlainHeadingMatch = trimmed.match(/^(#{2,6})\s+(.+)$/);
    if (mdPlainHeadingMatch && !hasLeadingWhitespace && !currentSection) {
      // Only treat as a new section if it's a top-level heading without numbering
      // (e.g., ## Assumptions) — but only after intro
    }
    if (mdPlainHeadingMatch && !hasLeadingWhitespace && currentSection) {
      const depth = mdPlainHeadingMatch[1].length; // ## = 2, ### = 3
      if (depth <= 2) {
        currentSection = {
          numbering: "",
          title: mdPlainHeadingMatch[2].replace(/\s*\*+$/g, "").trim(),
          level: 1,
          lines: [],
        };
        parsedSections.push(currentSection);
        return;
      }
    }

    if (!currentSection) {
      introLines.push(line);
      return;
    }

    currentSection.lines.push(line);
  });

  const hasIntro = introLines.some((line) => line.trim());
  if (hasIntro) {
    parsedSections.unshift({
      numbering: "",
      title: "Introduction",
      level: 1,
      lines: introLines,
    });
  }

  return parsedSections.map((section, index) => ({
    ...section,
    id: `analysis-section-${index + 1}`,
  }));
}

function buildTocHierarchy(sections) {
  const root = { children: [] };
  const stack = [root];

  sections.forEach((section) => {
    const item = {
      ...section,
      children: [],
    };

    while (stack.length > 1 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    parent.children.push(item);
    stack.push(item);
  });

  return root.children;
}

function renderTocItem(item, tocContainer, depth = 0) {
  const tocBtn = document.createElement("button");
  tocBtn.type = "button";
  tocBtn.className = "analysis-toc-item";
  if (depth > 0) {
    tocBtn.classList.add(`analysis-toc-indent-${Math.min(3, depth)}`);
  }
  tocBtn.dataset.sectionId = item.id;

  const title = item.title || "";
  if (item.numbering) {
    tocBtn.innerHTML = `<span class="toc-number">${item.numbering}</span><span class="toc-label">${title}</span>`;
  } else {
    tocBtn.innerHTML = `<span class="toc-label">${title}</span>`;
  }
  tocBtn.title = `${item.numbering ? item.numbering + ". " : ""}${title}`;

  tocBtn.addEventListener("click", () => {
    const target = document.getElementById(item.id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveAnalysisTocItem(item.id);
    }
  });
  tocContainer.appendChild(tocBtn);

  if (item.children && item.children.length > 0) {
    item.children.forEach((child) => {
      renderTocItem(child, tocContainer, depth + 1);
    });
  }
}

(function initAnalysisScrollSpy() {
  const docEl = document.getElementById("analysisDoc");
  if (!docEl) return;
  docEl.addEventListener("scroll", () => {
    const sections = docEl.querySelectorAll(".analysis-doc-section");
    if (!sections.length) return;
    let activeId = sections[0]?.id || "";
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const docRect = docEl.getBoundingClientRect();
      if (rect.top - docRect.top <= 60) {
        activeId = section.id;
      } else {
        break;
      }
    }
    if (activeId) setActiveAnalysisTocItem(activeId);
  });
})();

function renderAnalysisBodyLines(container, lines) {
  const usefulLines = Array.isArray(lines) ? lines : [];
  const hasContent = usefulLines.some((line) => line.trim());

  if (!hasContent) {
    const emptyP = document.createElement("p");
    emptyP.className = "text-muted mb-0";
    emptyP.textContent = "No additional details.";
    container.appendChild(emptyP);
    return;
  }

  const markdown = usefulLines.join("\n");
  const div = document.createElement("div");
  div.className = "analysis-md-rendered";

  if (typeof marked !== "undefined") {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function(code, lang) {
        if (typeof hljs !== "undefined" && lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return code;
      },
    });
    div.innerHTML = marked.parse(markdown);
  } else {
    div.innerHTML = `<pre style="white-space:pre-wrap;">${markdown}</pre>`;
  }

  // Post-process: add target=_blank to links
  div.querySelectorAll("a").forEach(a => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });

  // Highlight code blocks if hljs available
  if (typeof hljs !== "undefined") {
    div.querySelectorAll("pre code").forEach(block => {
      hljs.highlightElement(block);
    });
  }

  container.appendChild(div);
}

function setActiveAnalysisTocItem(sectionId) {
  analysisToc.querySelectorAll(".analysis-toc-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.sectionId === sectionId);
  });
}

function renderAnalysisDocument(rawText) {
  const sections = parseAnalysisSections(rawText);

  analysisToc.innerHTML = '<div class="analysis-toc-title">Contents</div>';
  analysisDoc.innerHTML = "";

  if (!sections.length) {
    const tocEmpty = document.createElement("div");
    tocEmpty.className = "analysis-toc-empty";
    tocEmpty.textContent = "No sections found in analysis.";
    analysisToc.appendChild(tocEmpty);

    const docEmpty = document.createElement("div");
    docEmpty.className = "analysis-doc-empty";
    docEmpty.textContent = "No analysis content returned.";
    analysisDoc.appendChild(docEmpty);
    return;
  }

  const hierarchy = buildTocHierarchy(sections);

  hierarchy.forEach((section) => {
    renderTocItem(section, analysisToc, 0);
  });

  sections.forEach((section, index) => {
    const sectionEl = document.createElement("section");
    sectionEl.className = "analysis-doc-section";
    sectionEl.id = section.id;

    const headingTag = section.level <= 1 ? "h2" : section.level === 2 ? "h3" : "h4";
    const headingEl = document.createElement(headingTag);
    headingEl.textContent = `${section.numbering ? `${section.numbering}. ` : ""}${section.title}`;
    sectionEl.appendChild(headingEl);

    renderAnalysisBodyLines(sectionEl, section.lines);
    analysisDoc.appendChild(sectionEl);

    if (index === 0) {
      setActiveAnalysisTocItem(section.id);
    }
  });
}

downloadAnalysisBtn.addEventListener("click", async () => {
  if (!currentAnalysisPromptId || !currentAnalysisText.trim()) return;

  downloadAnalysisBtn.disabled = true;
  downloadAnalysisBtn.textContent = "Downloading...";

  try {
    const blob = new Blob([currentAnalysisText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${currentAnalysisPromptId}-analysis.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    analysisStatus.textContent = "Analysis downloaded.";
  } catch (err) {
    analysisStatus.textContent = "Download failed: " + err.message;
  } finally {
    downloadAnalysisBtn.disabled = false;
    downloadAnalysisBtn.textContent = "Download";
  }
});

// --- TEST SCOPE: /testcase/{promptID} ---
const scopePromptIdInput = document.getElementById("scopePromptIdInput");
const scopeStatus = document.getElementById("scopeStatus");
const sectionListEl = document.getElementById("sectionList");
const testCaseTableBody = document.getElementById("testCaseTableBody");
const scopeTable = document.querySelector(".scope-table");
const tcTableWrap = document.querySelector(".tc-table-wrap");
const selectedSectionTitle = document.getElementById("selectedSectionTitle");
const allViewFilters = document.getElementById("allViewFilters");
const toggleIdColumn = document.getElementById("toggleIdColumn");
const focusSectionToggle = document.getElementById("focusSectionToggle");

let allTestCases = []; // raw data from backend
let sections = [];     // derived sections
let selectedSection = "all";
let selectedPlatformFilters = new Set(); // empty = show all platforms
let currentScopePromptId = null;
let currentPromptPlatformGroups = []; // PLATFORM_OPTIONS filtered by prompt's platforms
let focusSelectedSectionOnly = true;
let isSelectMode = false;
let selectedTcIds = new Set();
let tcSearchQuery = "";
let testrailSectionsCache = [];
let testrailSuitesCache = [];
let selectedTestrailSuiteId = null;
let isFetchingTestrailSections = false;
let isFetchingTestrailSuites = false;
const TESTRAIL_CASE_URL_BASE = "https://traveloka.testrail.com/index.php?/cases/view/";
let activeLockedEditPopover = null;

toggleIdColumn.addEventListener("change", () => {
  applyAllViewColumnVisibility();
});

focusSectionToggle.addEventListener("change", () => {
  setFocusSelectedSectionOnly(focusSectionToggle.checked);
});

function setFocusSelectedSectionOnly(isEnabled) {
  focusSelectedSectionOnly = isEnabled;
  focusSectionToggle.checked = isEnabled;
  localStorage.setItem("qa_focus_selected_section_only", isEnabled ? "1" : "0");

  if (!sections.length) return;

  if (selectedSection === "all") {
    selectedSectionTitle.textContent = "All Test Cases";
  } else {
    selectedSectionTitle.textContent = focusSelectedSectionOnly
      ? `Test Cases · ${selectedSection}`
      : `All Test Cases · ${selectedSection}`;
  }

  renderAllTestCases();
}

function getVisibleColumnsCount() {
  let visibleColumns = 2; // title + actions
  if (toggleIdColumn.checked) visibleColumns += 1;
  if (isSelectMode) visibleColumns += 1; // checkbox col
  return visibleColumns;
}

function applyAllViewColumnVisibility() {
  allViewFilters.style.display = "flex";

  const showId = toggleIdColumn.checked;
  document.querySelectorAll('.scope-table th[data-col="id"], .scope-table td[data-col="id"]').forEach(el => {
    el.style.display = showId ? "" : "none";
  });
  scopeTable.classList.toggle("id-hidden", !showId);

  document.querySelectorAll(".scope-table .tc-check-col").forEach(el => {
    el.style.display = isSelectMode ? "" : "none";
  });

  const colSpan = getVisibleColumnsCount();
  document.querySelectorAll("tr.scope-section-row td").forEach(cell => {
    cell.colSpan = colSpan;
  });
}

async function loadTestScope(promptId) {
  scopeStatus.textContent = "Loading test cases...";
  currentScopePromptId = promptId;
  // Resolve available platform groups from prompt data
  const promptEntry = allPrompts.find(p => p.promptId === promptId);
  currentPromptPlatformGroups = getAvailablePlatformGroups(promptEntry?.platforms);
  // Clear platform filter if current selection is not valid for this prompt
  if (selectedPlatformFilters.size > 0) {
    const validValues = new Set(currentPromptPlatformGroups.map(o => o.value));
    const toRemove = [...selectedPlatformFilters].filter(v => !validValues.has(v));
    toRemove.forEach(v => selectedPlatformFilters.delete(v));
  }
  renderPlatformFilterChips();
  updatePlatformFilterLabel();
  allTestCases = [];
  sections = [];
  selectedSection = "all";
  isSelectMode = false;
  selectedTcIds.clear();
  tcSearchQuery = "";
  testrailSectionsCache = [];
  testrailSuitesCache = [];
  selectedTestrailSuiteId = null;
  const _si = document.getElementById("tcSearchInput");
  if (_si) _si.value = "";
  const _sb = document.getElementById("tcSelectModeBtn");
  if (_sb) _sb.classList.remove("active");
  const _bb = document.getElementById("tcBulkBar");
  if (_bb) _bb.style.display = "none";
  sectionListEl.innerHTML = "";
  testCaseTableBody.innerHTML = `
    <tr><td colspan="${getVisibleColumnsCount()}" class="text-center text-muted small">
      Loading...
    </td></tr>`;

  try {
    // Expected response example:
    // {
    //   testcases: [
    //     { id: "TC-1", title: "Login with valid credentials", section: "Login", steps: "...", expected: "..." },
    //     ...
    //   ]
    // }
    const data = await apiRequest(`/testcase/${encodeURIComponent(promptId)}`);
    const rawTestCases = Array.isArray(data.data.testCases) ? data.data.testCases : [];
    allTestCases = rawTestCases.map(tc => {
      // Each TC already owns its section metadata in the flat model
      const rawSection = getRawSectionData(tc);
      const defaultName = getSectionGroupName(tc);

      return {
        ...tc,
        section: defaultName,
        _rawSection: rawSection,
        platforms: Array.isArray(tc.platforms) ? tc.platforms : [],
        preconditions: Array.isArray(tc.preconditions)
          ? tc.preconditions.join("\n")
          : (tc.preconditions || ""),
        steps: Array.isArray(tc.steps) ? tc.steps : (tc.steps || ""),
        expected: tc.expectedResult || tc.expected || "",
      };
    });

    // Resolve per-platform section meta based on active filter
    resolveAllTestCaseSectionMeta();

    if (!allTestCases.length) {
      scopeStatus.textContent = "No test cases found for this Prompt ID.";
      sectionListEl.innerHTML = '<div class="text-muted small">No sections available.</div>';
      testCaseTableBody.innerHTML = `
        <tr><td colspan="${getVisibleColumnsCount()}" class="text-center text-muted small">
          No test cases available.
        </td></tr>`;
      selectedSectionTitle.textContent = "All Test Cases";
      return;
    }

    // Build sections from test cases
    const sectionMap = new Map();
    allTestCases.forEach(tc => {
      const sec = (tc.section || "Uncategorized").trim();
      // Use both sectionId and name to prevent merging sections with duplicate IDs but different names
      const sectionKey = tc.sectionId != null
        ? `id:${tc.sectionId}:${sec.toLowerCase()}`
        : `name:${sec.toLowerCase()}`;

      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, {
          name: sec,
          sectionId: tc.sectionId ?? null,
          suiteId: tc.suiteId ?? null,
          source: tc.sectionSource || (tc.sectionId != null ? "testrail" : "ai"),
          _rawSection: tc._rawSection ?? null,
          testcases: [],
        });
      }

      sectionMap.get(sectionKey).testcases.push(tc);
    });

    sections = Array.from(sectionMap.values());

    renderSections();
    renderAllTestCases();
    selectedSectionTitle.textContent = "All Test Cases";
    applyAllViewColumnVisibility();

    scopeStatus.textContent = `Loaded ${allTestCases.length} test case(s) across ${sections.length} section(s).`;
  } catch (err) {
    scopeStatus.textContent = "Failed to load test scope: " + err.message;
    sectionListEl.innerHTML = '<div class="text-danger small">Error loading sections.</div>';
    testCaseTableBody.innerHTML = `
      <tr><td colspan="${getVisibleColumnsCount()}" class="text-center text-danger small">
        Error loading test cases.
      </td></tr>`;
  }
}

function buildSectionsFromCases() {
  const sectionMap = new Map();
  allTestCases.forEach(tc => {
    const sec = (tc.section || "Uncategorized").trim();
    // Use both sectionId and name to prevent merging sections with duplicate IDs but different names
    const sectionKey = tc.sectionId != null
      ? `id:${tc.sectionId}:${sec.toLowerCase()}`
      : `name:${sec.toLowerCase()}`;

    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, {
        name: sec,
        sectionId: tc.sectionId ?? null,
        suiteId: tc.suiteId ?? null,
        source: tc.sectionSource || (tc.sectionId != null ? "testrail" : "ai"),
        _rawSection: tc._rawSection ?? null,
        testcases: [],
      });
    }
    sectionMap.get(sectionKey).testcases.push(tc);
  });

  sections = Array.from(sectionMap.values());
}

/**
 * Resolve per-platform section meta on all test cases based on the active platform filter.
 * Sets tc.section, tc.sectionId, tc.suiteId, tc.sectionSource from tc._rawSection.
 * Must be called after loading and whenever platform filter changes.
 */
function resolveAllTestCaseSectionMeta() {
  const pg = getActivePlatformGroup();
  allTestCases.forEach(tc => {
    if (tc._rawSection) {
      const resolved = resolveSectionData(tc._rawSection, pg);
      tc.section = resolved.name;
      tc.sectionId = resolved.sectionId;
      tc.suiteId = resolved.suiteId;
      tc.sectionSource = resolved.sectionSource;
    }
  });
}

function renderSections() {
  sectionListEl.innerHTML = "";

  // Filter sections based on active platform filter
  const expandedPlatformsForSections = selectedPlatformFilters.size > 0 ? expandPlatformFilter(selectedPlatformFilters) : null;
  const filteredSections = expandedPlatformsForSections
    ? sections.map(sec => ({
        ...sec,
        filteredCount: sec.testcases.filter(tc => {
          const tcPlatforms = Array.isArray(tc.platforms) ? tc.platforms : [];
          return tcPlatforms.some(p => expandedPlatformsForSections.has(p));
        }).length,
      })).filter(sec => sec.filteredCount > 0)
    : sections.map(sec => ({ ...sec, filteredCount: sec.testcases.length }));

  const totalFilteredCount = filteredSections.reduce((sum, sec) => sum + sec.filteredCount, 0);

  const allItem = document.createElement("div");
  allItem.className = `section-item ${selectedSection === "all" ? "active" : ""}`;
  allItem.textContent = `All Sections (${totalFilteredCount})`;
  allItem.addEventListener("click", () => selectSection("all"));
  sectionListEl.appendChild(allItem);

  filteredSections.forEach(sec => {
    const div = document.createElement("div");
    div.className = "section-item";
    if (sec.name === selectedSection) {
      div.classList.add("active");
    }
    const normalizedSource = String(sec.source || "ai").toLowerCase();
    const sectionSource = normalizedSource === "testrail" || normalizedSource === "user" ? normalizedSource : "ai";
    const sourceLabel = sectionSource === "testrail" ? "TestRail" : sectionSource === "user" ? "User" : "AI";
    div.innerHTML = `
      <div class="d-flex align-items-center justify-content-between gap-2">
        <span class="text-truncate">${escapeHtml(sec.name)} (${sec.filteredCount})</span>
        <span class="section-origin-pill origin-${sectionSource}">${sourceLabel}</span>
      </div>
    `;
    div.dataset.section = sec.name;
    div.addEventListener("click", () => {
      selectSection(sec.name);
    });
    sectionListEl.appendChild(div);
  });
}

function createActionButtons(tc) {
  const tdActions = document.createElement("td");
  tdActions.className = "text-end";
  const platformGroupKey = selectedPlatformFilters.size === 1 ? [...selectedPlatformFilters][0] : null;
  const isPostedToTestrail = hasPostedToTestrailFrontend(tc, platformGroupKey);
  tdActions.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary icon-action-btn" title="See detail" aria-label="See detail">
      <i class="bi bi-eye"></i>
    </button>
    <button class="btn btn-sm btn-outline-primary icon-action-btn${isPostedToTestrail ? " is-disabled is-locked" : ""}" title="${isPostedToTestrail ? "Edit disabled for TestRail-posted cases" : "Edit"}" aria-label="${isPostedToTestrail ? "Edit disabled for TestRail-posted cases" : "Edit"}" aria-disabled="${isPostedToTestrail ? "true" : "false"}">
      <i class="bi bi-pencil-square"></i>
    </button>
    <button class="btn btn-sm btn-outline-danger icon-action-btn" title="Delete" aria-label="Delete">
      <i class="bi bi-trash"></i>
    </button>
  `;

  const [btnView, btnEdit, btnDelete] = tdActions.querySelectorAll("button");
  btnView.addEventListener("click", () => openViewModal(tc));
  if (isPostedToTestrail) {
    attachLockedEditPopover(btnEdit, tc);
  } else {
    btnEdit.addEventListener("click", () => openEditModal(tc));
  }
  btnDelete.addEventListener("click", () => openDeleteModal(tc));

  return tdActions;
}

function getTestrailCaseUrl(caseId) {
  return `${TESTRAIL_CASE_URL_BASE}${encodeURIComponent(String(caseId || "").trim())}`;
}

function closeLockedEditPopover() {
  if (!activeLockedEditPopover?.instance) return;
  activeLockedEditPopover.instance.hide();
  activeLockedEditPopover = null;
}

function buildLockedEditPopoverContent(tc = {}) {
  const displayPost = getTestrailPostForDisplay(tc);
  const caseId = displayPost?.testrailCaseId;
  const href = getTestrailCaseUrl(caseId);
  const escapedCaseId = escapeHtml(caseId);

  return `
    <div class="tr-locked-popover-body">
      <div class="tr-locked-popover-icon"><i class="bi bi-lock-fill"></i></div>
      <div class="tr-locked-popover-copy">This test case is already posted to TestRail. You can directly edit it there to keep both systems consistent.</div>
      <div class="tr-locked-popover-case">Linked TestRail case: <strong>C${escapedCaseId}</strong></div>
      <a class="btn btn-sm btn-primary tr-locked-popover-link" href="${href}" target="_blank" rel="noopener noreferrer">
        <i class="bi bi-box-arrow-up-right me-1"></i>Open in TestRail
      </a>
    </div>
  `;
}

function attachLockedEditPopover(button, tc) {
  if (!button) return;

  const popover = bootstrap.Popover.getOrCreateInstance(button, {
    trigger: "manual",
    html: true,
    sanitize: false,
    placement: "left",
    container: "body",
    customClass: "tr-locked-popover",
    title: '<span class="tr-locked-popover-title"><i class="bi bi-slash-circle me-1"></i>Edit locked</span>',
    content: () => buildLockedEditPopoverContent(tc),
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const isOpen = button.getAttribute("aria-describedby");
    if (isOpen) {
      popover.hide();
      activeLockedEditPopover = null;
      return;
    }

    closeLockedEditPopover();
    popover.show();
    activeLockedEditPopover = { instance: popover, button };
  });

  button.addEventListener("shown.bs.popover", () => {
    activeLockedEditPopover = { instance: popover, button };
  });

  button.addEventListener("hidden.bs.popover", () => {
    if (activeLockedEditPopover?.button === button) {
      activeLockedEditPopover = null;
    }
  });
}

document.addEventListener("click", (event) => {
  if (!activeLockedEditPopover?.instance || !activeLockedEditPopover?.button) return;

  const openPopover = document.querySelector(".popover.tr-locked-popover.show");
  if (activeLockedEditPopover.button.contains(event.target)) return;
  if (openPopover?.contains(event.target)) return;

  closeLockedEditPopover();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLockedEditPopover();
  }
});

function scrollRowBelowStickyHeader(row, behavior = "smooth") {
  if (!row) return;

  const container = tcTableWrap || row.closest(".tc-table-wrap");
  if (!container) {
    row.scrollIntoView({ behavior, block: "start" });
    return;
  }

  const stickyHeader = scopeTable?.querySelector("thead");
  const stickyOffset = stickyHeader ? stickyHeader.getBoundingClientRect().height : 0;

  const containerRect = container.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const targetTop = container.scrollTop + (rowRect.top - containerRect.top) - stickyOffset - 2;

  container.scrollTo({
    top: Math.max(0, targetTop),
    behavior,
  });
}

function renderAllTestCases() {
  // Dispose existing platform badge tooltips before re-rendering
  document.querySelectorAll('.tc-platform-badge[data-bs-toggle="tooltip"]').forEach(el => {
    const tip = bootstrap.Tooltip.getInstance(el);
    if (tip) tip.dispose();
  });

  const emptySpan = getVisibleColumnsCount();

  if (!allTestCases.length) {
    testCaseTableBody.innerHTML = `<tr><td colspan="${emptySpan}" class="text-center text-muted small py-3">No test cases available.</td></tr>`;
    updateSelectAllState();
    return;
  }

  const sectionsToRender = (focusSelectedSectionOnly && selectedSection !== "all")
    ? sections.filter(section => section.name === selectedSection)
    : sections;

  const query = tcSearchQuery.toLowerCase().trim();
  const expandedPlatforms = selectedPlatformFilters.size > 0 ? expandPlatformFilter(selectedPlatformFilters) : null;
  const filteredSections = sectionsToRender.map(section => ({
    ...section,
    testcases: section.testcases.filter(tc => {
      // Platform filter
      if (expandedPlatforms) {
        const tcPlatforms = Array.isArray(tc.platforms) ? tc.platforms : [];
        if (!tcPlatforms.some(p => expandedPlatforms.has(p))) return false;
      }
      // Search filter
      if (query) {
        return (tc.id || "").toLowerCase().includes(query) ||
               (tc.title || "").toLowerCase().includes(query);
      }
      return true;
    }),
  })).filter(s => s.testcases.length > 0);

  if (!filteredSections.length) {
    const msg = query
      ? `No results for "<strong>${escapeHtml(query)}</strong>"`
      : "No test cases available.";
    testCaseTableBody.innerHTML = `<tr><td colspan="${emptySpan}" class="text-center text-muted small py-3">${msg}</td></tr>`;
    updateSelectAllState();
    return;
  }

  testCaseTableBody.innerHTML = "";
  filteredSections.forEach(section => {
    const sectionRow = document.createElement("tr");
    sectionRow.className = "scope-section-row";
    sectionRow.dataset.sectionHeader = section.name;
    const sectionCell = document.createElement("td");
    sectionCell.colSpan = getVisibleColumnsCount();
    const normalizedSource = String(section.source || "ai").toLowerCase();
    const sectionSource = normalizedSource === "testrail" || normalizedSource === "user" ? normalizedSource : "ai";
    const sourceLabel = sectionSource === "testrail" ? "TestRail" : sectionSource === "user" ? "User" : "AI";

    // Section select-all checkbox (inside the cell, only visible in select mode)
    const sectionCbWrap = document.createElement("span");
    sectionCbWrap.className = "section-cb-wrap";
    sectionCbWrap.style.display = isSelectMode ? "inline-flex" : "none";
    const sectionCb = document.createElement("input");
    sectionCb.type = "checkbox";
    sectionCb.className = "form-check-input section-select-all-cb mb-0";
    sectionCb.dataset.sectionName = section.name;
    sectionCb.title = "Select all in this section";
    const sectionIds = section.testcases.map(tc => tc.id).filter(Boolean);
    const sCheckedCount = sectionIds.filter(id => selectedTcIds.has(id)).length;
    sectionCb.checked = sectionIds.length > 0 && sCheckedCount === sectionIds.length;
    sectionCb.indeterminate = sCheckedCount > 0 && sCheckedCount < sectionIds.length;
    sectionCb.addEventListener("change", () => {
      const tcRows = Array.from(testCaseTableBody.querySelectorAll(`.testcase-row[data-section="${CSS.escape(section.name)}"]`));
      tcRows.forEach(row => {
        const id = row.dataset.tcId;
        if (!id) return;
        if (sectionCb.checked) selectedTcIds.add(id);
        else selectedTcIds.delete(id);
        row.classList.toggle("tc-selected", sectionCb.checked);
        const rowCb = row.querySelector(".tc-row-check");
        if (rowCb) rowCb.checked = sectionCb.checked;
      });
      updateBulkBar();
      updateSelectAllState();
    });
    sectionCbWrap.appendChild(sectionCb);

    const sectionContentDiv = document.createElement("div");
    sectionContentDiv.className = "d-flex align-items-center justify-content-between gap-2";
    sectionContentDiv.innerHTML = `
      <span class="d-flex align-items-center gap-2"></span>
      <span class="d-flex align-items-center gap-1">
        <span class="section-origin-pill origin-${sectionSource}">${sourceLabel}</span>
      </span>
    `;
    const sectionNameSpan = sectionContentDiv.querySelector("span.d-flex");
    const sectionActionsSpan = sectionContentDiv.querySelectorAll("span.d-flex")[1];
    sectionNameSpan.prepend(sectionCbWrap);
    const namePart = document.createElement("span");
    namePart.className = "section-name-text";
    namePart.textContent = `${section.name} (${section.testcases.length})`;
    sectionNameSpan.appendChild(namePart);

    // Edit section name button (block if any platform group has testrail source)
    const blockRename = sectionSource === "testrail" || hasAnyTestrailSource(section._rawSection);
    if (!blockRename) {
      const editSectionBtn = document.createElement("button");
      editSectionBtn.className = "btn btn-sm section-action-btn section-edit-btn";
      editSectionBtn.title = "Rename section";
      editSectionBtn.setAttribute("aria-label", "Rename section");
      editSectionBtn.innerHTML = '<i class="bi bi-pencil"></i>';
      editSectionBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startInlineEditSection(sectionRow, section, namePart);
      });
      sectionNameSpan.appendChild(editSectionBtn);
    }

    // Add test case button
    const addTcBtn = document.createElement("button");
    addTcBtn.className = "btn btn-sm section-action-btn section-add-btn";
    addTcBtn.title = "Add test case to this section";
    addTcBtn.setAttribute("aria-label", "Add test case");
    addTcBtn.innerHTML = '<i class="bi bi-plus-lg"></i>';
    addTcBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openAddTestCaseModal(section);
    });
    sectionNameSpan.appendChild(addTcBtn);

    sectionCell.appendChild(sectionContentDiv);
    sectionRow.appendChild(sectionCell);
    testCaseTableBody.appendChild(sectionRow);

    section.testcases.forEach(tc => {
      const tr = document.createElement("tr");
      tr.className = "testcase-row";
      if (selectedTcIds.has(tc.id)) tr.classList.add("tc-selected");
      tr.dataset.section = section.name;
      tr.dataset.tcId = tc.id || "";

      // Checkbox cell
      const tdCheck = document.createElement("td");
      tdCheck.className = "tc-check-col";
      tdCheck.style.display = isSelectMode ? "" : "none";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "form-check-input tc-row-check";
      cb.checked = selectedTcIds.has(tc.id);
      cb.addEventListener("change", () => {
        if (cb.checked) selectedTcIds.add(tc.id);
        else selectedTcIds.delete(tc.id);
        tr.classList.toggle("tc-selected", cb.checked);
        updateBulkBar();
        updateSelectAllState();
      });
      tdCheck.appendChild(cb);
      tr.appendChild(tdCheck);

      const tdId = document.createElement("td");
      tdId.dataset.col = "id";
      const displayPost = getTestrailPostForDisplay(tc);
      const trCaseId = displayPost?.testrailCaseId;
      if (trCaseId != null) {
        tdId.textContent = `C${trCaseId}`;
        tdId.title = `Local ID: ${tc.id || ""}`;
      } else {
        tdId.textContent = tc.id || "";
      }
      tr.appendChild(tdId);

      const tdTitle = document.createElement("td");
      tdTitle.dataset.col = "title";
      if (displayPost?.status === "success") {
        const titleSpan = document.createElement("span");
        titleSpan.textContent = tc.title || "";
        const icon = document.createElement("span");
        icon.className = "tr-posted-badge";
        const caseId = displayPost.testrailCaseId ?? "?";
        const postedDate = displayPost.lastAttemptAt ? new Date(displayPost.lastAttemptAt).toLocaleDateString() : null;
        // Show which platform group(s) are posted
        const postedGroups = getPostedPlatformGroups(tc);
        const groupLabel = postedGroups.length ? ` · ${postedGroups.join(", ")}` : "";
        icon.dataset.tooltip = `TestRail Case #${caseId}${postedDate ? " · Posted " + postedDate : ""}${groupLabel}`;
        icon.innerHTML = '<i class="bi bi-cloud-check-fill"></i>';
        tdTitle.appendChild(titleSpan);
        tdTitle.appendChild(icon);
      } else {
        tdTitle.textContent = tc.title || "";
      }
      // Platform badges
      const tcPlatforms = Array.isArray(tc.platforms) ? tc.platforms : [];
      if (tcPlatforms.length > 0) {
        const badgeWrap = document.createElement("span");
        badgeWrap.className = "tc-platform-badges";
        tcPlatforms.forEach(p => {
          const badge = document.createElement("span");
          badge.className = `tc-platform-badge tc-platform-${p}`;
          const opt = EDIT_PLATFORM_OPTIONS.find(o => o.value === p);
          const iconClass = opt ? opt.icon : "bi-question-circle";
          const label = opt ? opt.label : p;
          badge.innerHTML = `<i class="bi ${iconClass}"></i>`;
          badge.setAttribute("data-bs-toggle", "tooltip");
          badge.setAttribute("data-bs-placement", "top");
          badge.setAttribute("title", label);
          badgeWrap.appendChild(badge);
        });
        tdTitle.appendChild(badgeWrap);
      }
      tr.appendChild(tdTitle);

      tr.appendChild(createActionButtons(tc));
      testCaseTableBody.appendChild(tr);
    });
  });

  applyAllViewColumnVisibility();
  updateSelectAllState();

  // Initialize Bootstrap tooltips for platform badges
  document.querySelectorAll('.tc-platform-badge[data-bs-toggle="tooltip"]').forEach(el => {
    new bootstrap.Tooltip(el);
  });
}

function selectSection(sectionName) {
  selectedSection = sectionName;
  renderSections();

  if (focusSelectedSectionOnly) {
    if (sectionName === "all") {
      selectedSectionTitle.textContent = "All Test Cases";
    } else {
      selectedSectionTitle.textContent = `Test Cases · ${sectionName}`;
    }
    renderAllTestCases();
    return;
  }

  if (sectionName === "all") {
    selectedSectionTitle.textContent = "All Test Cases";
    applyAllViewColumnVisibility();
    const firstHeader = testCaseTableBody.querySelector("tr.scope-section-row");
    if (firstHeader) {
      scrollRowBelowStickyHeader(firstHeader);
    }
    return;
  }

  selectedSectionTitle.textContent = `All Test Cases · ${sectionName}`;
  applyAllViewColumnVisibility();
  const target = testCaseTableBody.querySelector(`tr[data-section-header="${CSS.escape(sectionName)}"]`)
    || testCaseTableBody.querySelector(`tr[data-section="${CSS.escape(sectionName)}"]`);

  if (target) {
    scrollRowBelowStickyHeader(target);
    target.classList.add("row-focus");
    setTimeout(() => target.classList.remove("row-focus"), 1300);
  }
}

setFocusSelectedSectionOnly(localStorage.getItem("qa_focus_selected_section_only") !== "0");

// --- Test case search filter ---
document.getElementById("tcSearchInput").addEventListener("input", (e) => {
  tcSearchQuery = e.target.value;
  renderAllTestCases();
});

// Platform filter (multiselect chips)
const tcPlatformFilterToggle = document.getElementById("tcPlatformFilterToggle");
const tcPlatformFilterDropdown = document.getElementById("tcPlatformFilterDropdown");
const tcPlatformFilterChips = document.getElementById("tcPlatformFilterChips");
const tcPlatformFilterLabel = document.getElementById("tcPlatformFilterLabel");

function renderPlatformFilterChips() {
  tcPlatformFilterChips.innerHTML = "";
  const availableGroups = currentPromptPlatformGroups.length ? currentPromptPlatformGroups : PLATFORM_OPTIONS;
  availableGroups.forEach(opt => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `platform-chip${selectedPlatformFilters.has(opt.value) ? " platform-chip-selected" : ""}`;
    chip.dataset.value = opt.value;
    chip.innerHTML = `<i class="bi ${opt.icon}"></i> ${opt.label}`;
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      if (selectedPlatformFilters.has(opt.value)) {
        selectedPlatformFilters.clear();
      } else {
        selectedPlatformFilters.clear();
        selectedPlatformFilters.add(opt.value);
      }
      renderPlatformFilterChips();
      updatePlatformFilterLabel();
      resolveAllTestCaseSectionMeta();
      buildSectionsFromCases();
      renderSections();
      renderAllTestCases();
      updateBulkBar();
    });
    tcPlatformFilterChips.appendChild(chip);
  });
}

function updatePlatformFilterLabel() {
  if (selectedPlatformFilters.size === 0) {
    tcPlatformFilterLabel.textContent = "All Platforms";
  } else if (selectedPlatformFilters.size === 1) {
    const val = [...selectedPlatformFilters][0];
    const availableGroups = currentPromptPlatformGroups.length ? currentPromptPlatformGroups : PLATFORM_OPTIONS;
    const opt = availableGroups.find(o => o.value === val) || PLATFORM_OPTIONS.find(o => o.value === val);
    tcPlatformFilterLabel.textContent = opt ? opt.label : val;
  } else {
    tcPlatformFilterLabel.textContent = `${selectedPlatformFilters.size} Platforms`;
  }
}

tcPlatformFilterToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = tcPlatformFilterDropdown.style.display !== "none";
  tcPlatformFilterDropdown.style.display = isOpen ? "none" : "block";
  tcPlatformFilterToggle.classList.toggle("active", !isOpen);
  if (!isOpen) renderPlatformFilterChips();
});

// Close dropdown on outside click
document.addEventListener("click", (e) => {
  if (!document.getElementById("tcPlatformFilter").contains(e.target)) {
    tcPlatformFilterDropdown.style.display = "none";
    tcPlatformFilterToggle.classList.remove("active");
  }
});

// Reset platform filter
document.getElementById("tcPlatformFilterReset").addEventListener("click", (e) => {
  e.stopPropagation();
  selectedPlatformFilters.clear();
  renderPlatformFilterChips();
  updatePlatformFilterLabel();
  resolveAllTestCaseSectionMeta();
  buildSectionsFromCases();
  renderSections();
  renderAllTestCases();
  updateBulkBar();
});

// --- Select mode toggle ---
document.getElementById("tcSelectModeBtn").addEventListener("click", () => {
  isSelectMode = !isSelectMode;
  if (!isSelectMode) selectedTcIds.clear();
  document.getElementById("tcSelectModeBtn").classList.toggle("active", isSelectMode);
  updateBulkBar();
  renderAllTestCases();
});

// --- Select all checkbox ---
document.getElementById("tcSelectAll").addEventListener("change", (e) => {
  const rows = Array.from(testCaseTableBody.querySelectorAll(".testcase-row"));
  rows.forEach(row => {
    const id = row.dataset.tcId;
    if (!id) return;
    if (e.target.checked) selectedTcIds.add(id);
    else selectedTcIds.delete(id);
    row.classList.toggle("tc-selected", e.target.checked);
    const cb = row.querySelector(".tc-row-check");
    if (cb) cb.checked = e.target.checked;
  });
  updateBulkBar();
});

document.getElementById("tcBulkEditSectionBtn").addEventListener("click", handleBulkEditSection);
document.getElementById("tcBulkPostTestrailBtn").addEventListener("click", handleBulkPostToTestrail);
document.getElementById("tcBulkDeleteBtn").addEventListener("click", handleBulkDelete);
document.getElementById("tcClearSelectionBtn").addEventListener("click", () => {
  selectedTcIds.clear();
  isSelectMode = false;
  document.getElementById("tcSelectModeBtn").classList.remove("active");
  updateBulkBar();
  renderAllTestCases();
});

// --- Modals logic ---

// View
const viewTestCaseModal = new bootstrap.Modal(document.getElementById("viewTestCaseModal"));
function renderListItems(raw, ordered = false) {
  const lines = String(raw || "").split("\n").map(l => l.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean);
  if (!lines.length) return `<span class="tc-view-empty">—</span>`;
  const tag = ordered ? "ol" : "ul";
  const cls = ordered ? "tc-view-steps-list" : "tc-view-bullets-list";
  const items = lines.map(l => `<li>${escapeHtml(l)}</li>`).join("");
  return `<${tag} class="${cls}">${items}</${tag}>`;
}

function renderStepItems(steps) {
  if (!steps) return `<span class="tc-view-empty">—</span>`;
  // Handle new format: array of {content, expected}
  if (Array.isArray(steps)) {
    if (!steps.length) return `<span class="tc-view-empty">—</span>`;
    // Check if objects with content/expected
    if (typeof steps[0] === "object" && steps[0] !== null) {
      const rows = steps.map((s, i) => {
        const content = escapeHtml(s.content || "");
        const expected = escapeHtml(s.expected || "N/A");
        return `<tr><td class="step-num">${i + 1}</td><td>${content}</td><td class="step-expected">${expected}</td></tr>`;
      }).join("");
      return `<table class="tc-steps-table"><thead><tr><th>#</th><th>Action</th><th>Expected</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    // Legacy: array of strings
    return renderListItems(steps.join("\n"), true);
  }
  // Legacy: plain string
  return renderListItems(steps, true);
}

// ─── Steps Editor (structured rows) ───
function renderStepEditorRows(steps) {
  const container = document.getElementById("editTcStepsEditor");
  container.innerHTML = "";
  const stepsArr = normalizeStepsForEditor(steps);
  if (!stepsArr.length) stepsArr.push({ content: "", expected: "" });
  stepsArr.forEach((s, i) => container.appendChild(createStepRow(s, i)));
  renumberStepRows();
}

function normalizeStepsForEditor(steps) {
  if (!steps) return [];
  if (Array.isArray(steps)) {
    if (steps.length && typeof steps[0] === "object" && steps[0] !== null) {
      return steps.map(s => ({ content: s.content || "", expected: s.expected || "" }));
    }
    return steps.filter(Boolean).map(s => ({ content: String(s), expected: "" }));
  }
  return String(steps || "").split("\n").filter(Boolean).map(s => ({ content: s, expected: "" }));
}

function createStepRow(step, index) {
  const row = document.createElement("div");
  row.className = "tc-step-row";
  row.innerHTML = `
    <div class="tc-step-num"><span>${index + 1}</span></div>
    <div class="tc-step-fields">
      <div class="tc-step-field">
        <label class="tc-step-field-label">Action</label>
        <textarea class="form-control tc-step-input" data-field="content" rows="2" placeholder="Describe the action...">${escapeHtml(step.content || "")}</textarea>
      </div>
      <div class="tc-step-field">
        <label class="tc-step-field-label">Expected Result</label>
        <textarea class="form-control tc-step-input tc-step-expected-input" data-field="expected" rows="2" placeholder="Expected outcome (leave empty for N/A)">${escapeHtml(step.expected === "N/A" ? "" : (step.expected || ""))}</textarea>
      </div>
    </div>
    <div class="tc-step-actions">
      <button type="button" class="btn btn-sm tc-step-move-btn" data-dir="up" title="Move up"><i class="bi bi-chevron-up"></i></button>
      <button type="button" class="btn btn-sm tc-step-move-btn" data-dir="down" title="Move down"><i class="bi bi-chevron-down"></i></button>
      <button type="button" class="btn btn-sm tc-step-delete-btn" title="Remove step"><i class="bi bi-trash3"></i></button>
    </div>
  `;
  // Event listeners
  row.querySelector(".tc-step-delete-btn").addEventListener("click", () => {
    const editor = document.getElementById("editTcStepsEditor");
    if (editor.children.length > 1) { row.remove(); renumberStepRows(); }
  });
  row.querySelector('[data-dir="up"]').addEventListener("click", () => {
    const prev = row.previousElementSibling;
    if (prev) { row.parentNode.insertBefore(row, prev); renumberStepRows(); }
  });
  row.querySelector('[data-dir="down"]').addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) { row.parentNode.insertBefore(next, row); renumberStepRows(); }
  });
  return row;
}

function renumberStepRows() {
  const rows = document.querySelectorAll("#editTcStepsEditor .tc-step-row");
  rows.forEach((row, i) => { row.querySelector(".tc-step-num span").textContent = i + 1; });
}

function collectStepsFromEditor() {
  const rows = document.querySelectorAll("#editTcStepsEditor .tc-step-row");
  const steps = [];
  rows.forEach(row => {
    const content = row.querySelector('[data-field="content"]').value.trim();
    const expected = row.querySelector('[data-field="expected"]').value.trim() || "N/A";
    if (content) steps.push({ content, expected });
  });
  return steps;
}

// Add step button
document.getElementById("editTcAddStepBtn").addEventListener("click", () => {
  const editor = document.getElementById("editTcStepsEditor");
  const idx = editor.children.length;
  editor.appendChild(createStepRow({ content: "", expected: "" }, idx));
  renumberStepRows();
  const lastRow = editor.lastElementChild;
  lastRow.querySelector('[data-field="content"]').focus();
});

function openViewModal(tc) {
  document.getElementById("viewTcId").textContent = tc.id || "";
  document.getElementById("viewTcTitle").textContent = tc.title || "";
  document.getElementById("viewTcSection").textContent = tc.section || "";
  document.getElementById("viewTcPreconditions").innerHTML = renderListItems(tc.preconditions, false);
  document.getElementById("viewTcSteps").innerHTML = renderStepItems(tc.steps);
  document.getElementById("viewTcExpected").textContent = tc.expected || "";

  // Platforms
  const platforms = Array.isArray(tc.platforms) ? tc.platforms : [];
  const platformRow = document.getElementById("viewTcPlatformRow");
  const platformContainer = document.getElementById("viewTcPlatforms");
  if (platforms.length > 0 && platformRow && platformContainer) {
    platformContainer.innerHTML = "";
    platforms.forEach(p => {
      const badge = document.createElement("span");
      badge.className = `tc-view-platform-badge tc-platform-${p}`;
      const opt = PLATFORM_OPTIONS.find(o => o.value === p);
      badge.innerHTML = `<i class="bi ${opt ? opt.icon : "bi-question-circle"}"></i> ${opt ? opt.label : p}`;
      platformContainer.appendChild(badge);
    });
    platformRow.style.display = "";
  } else if (platformRow) {
    platformRow.style.display = "none";
  }

  viewTestCaseModal.show();
}

// Edit
const editTestCaseModal = new bootstrap.Modal(document.getElementById("editTestCaseModal"));
const editTestCaseForm = document.getElementById("editTestCaseForm");

function normalizeSectionOption(option = {}) {
  if (typeof option === "string") {
    const name = String(option || "").trim();
    return {
      name,
      sectionId: null,
      suiteId: null,
      source: "ai",
      depth: 0,
      parentId: null,
    };
  }

  const name = String(option.name || option.section || "").trim();
  const sectionIdRaw = option.sectionId != null ? option.sectionId : option.id;
  const suiteIdRaw = option.suiteId != null ? option.suiteId : option.suite_id;
  const sectionId = sectionIdRaw != null && sectionIdRaw !== "" ? Number(sectionIdRaw) : null;
  const suiteId = suiteIdRaw != null && suiteIdRaw !== "" ? Number(suiteIdRaw) : null;
  const sourceHint = String(option.source || option.sectionSource || "").trim().toLowerCase();
  const source = sourceHint === "testrail" || sourceHint === "ai" || sourceHint === "user"
    ? sourceHint
    : (sectionId != null ? "testrail" : "ai");

  return {
    name,
    sectionId: Number.isFinite(sectionId) ? sectionId : null,
    suiteId: Number.isFinite(suiteId) ? suiteId : null,
    source,
    depth: Number.isFinite(Number(option.depth)) ? Number(option.depth) : 0,
    parentId: option.parentId != null ? option.parentId : option.parent_id ?? null,
  };
}

function buildSectionOptionKey(option = {}) {
  const normalized = normalizeSectionOption(option);
  // Use both sectionId and name to prevent deduplicating sections with same ID but different names
  if (normalized.sectionId != null) {
    return `id:${normalized.sectionId}:${normalized.name.toLowerCase()}`;
  }
  return `name:${normalized.name.toLowerCase()}`;
}

function dedupeSectionOptions(options = []) {
  const map = new Map();
  (options || []).forEach((item) => {
    const normalized = normalizeSectionOption(item);
    if (!normalized.name) return;
    const key = buildSectionOptionKey(normalized);
    if (!map.has(key)) {
      map.set(key, normalized);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const sourceRank = { testrail: 0, user: 1, ai: 2 };
    if (a.source !== b.source) {
      return (sourceRank[a.source] ?? 99) - (sourceRank[b.source] ?? 99);
    }
    return a.name.localeCompare(b.name);
  });
}

function formatSectionTriggerText(selection = {}, isNew = false) {
  const option = normalizeSectionOption(selection);
  const text = String(option.name || "").trim();
  if (!text) {
    return '<span class="prompt-select-trigger-text is-placeholder">Search or create section...</span>';
  }

  if (isNew) {
    return `<span class="section-selected-badge badge-new"><i class="bi bi-plus-lg"></i>New</span><span class="prompt-select-trigger-text">${escapeHtml(text)}</span>`;
  }

  const sourceLabelMap = {
    testrail: { css: "testrail", text: "TestRail", icon: "bi-cloud-check" },
    ai: { css: "ai", text: "AI", icon: "bi-stars" },
    user: { css: "user", text: "User", icon: "bi-person" },
  };
  const sourceMeta = sourceLabelMap[option.source] || sourceLabelMap.ai;
  const badgeClass = sourceMeta.css === "testrail" ? "badge-testrail" : sourceMeta.css === "user" ? "badge-new" : "badge-ai";
  const badgeText = sourceMeta.text;
  const badgeIcon = sourceMeta.icon;
  return `<span class="section-selected-badge ${badgeClass}"><i class="bi ${badgeIcon}"></i>${badgeText}</span><span class="prompt-select-trigger-text">${escapeHtml(text)}</span>`;
}

function createSectionPicker({ wrapId, triggerId, triggerTextId, dropdownId, searchId, optionsId, valueId, wrapEl: _wrapEl, triggerEl: _triggerEl, dropdownEl: _dropdownEl, searchEl: _searchEl, optionsEl: _optionsEl, valueEl: _valueEl }) {
  const wrapEl = _wrapEl || document.getElementById(wrapId);
  const triggerEl = _triggerEl || document.getElementById(triggerId);
  const dropdownEl = _dropdownEl || document.getElementById(dropdownId);
  const searchEl = _searchEl || document.getElementById(searchId);
  const optionsEl = _optionsEl || document.getElementById(optionsId);
  const valueEl = _valueEl || document.getElementById(valueId);

  let allOptions = [];
  let selectedValue = "";
  let selectedIsNew = false;
  let selectedOption = normalizeSectionOption({});
  let disableCreate = false;

  function renderTrigger() {
    triggerEl.innerHTML = `${formatSectionTriggerText(selectedOption, selectedIsNew)}<i class="bi bi-chevron-down" style="font-size:0.75rem;flex-shrink:0;"></i>`;
  }

  function renderOptions(filter = "") {
    const query = String(filter || "").trim().toLowerCase();
    const filtered = allOptions.filter((option) => option.name.toLowerCase().includes(query));
    const exactMatch = allOptions.some((option) => option.name.toLowerCase() === query);
    const testrailById = new Map(
      allOptions
        .filter((option) => option.source === "testrail" && option.sectionId != null)
        .map((option) => [Number(option.sectionId), option])
    );

    function resolveTestrailPath(option) {
      if (!option || option.source !== "testrail") {
        return "";
      }

      const names = [];
      const visited = new Set();
      let cursor = option;

      while (cursor) {
        const cursorId = cursor.sectionId != null ? Number(cursor.sectionId) : null;
        if (cursorId != null) {
          if (visited.has(cursorId)) break;
          visited.add(cursorId);
        }

        if (cursor.name) {
          names.unshift(String(cursor.name).trim());
        }

        const parentId = cursor.parentId != null ? Number(cursor.parentId) : null;
        if (parentId == null) break;
        cursor = testrailById.get(parentId) || null;
      }

      return names.filter(Boolean).join(":");
    }

    optionsEl.innerHTML = "";

    filtered.forEach((option) => {
      const optionKey = buildSectionOptionKey(option);
      const selectedKey = buildSectionOptionKey(selectedOption);
      const isSelected = !selectedIsNew && optionKey === selectedKey;
      const sectionSource = option.source === "testrail" || option.source === "user" ? option.source : "ai";
      const isTestrail = sectionSource === "testrail";
      const sourceLabel = sectionSource === "testrail" ? "TestRail" : sectionSource === "user" ? "User" : "AI";
      const sectionPath = resolveTestrailPath(option);
      const sectionMeta = isTestrail
        ? `${sectionPath ? `${escapeHtml(sectionPath)} · ` : ""}TestRail section${option.suiteId != null ? ` · Suite ${escapeHtml(option.suiteId)}` : ""}`
        : (sectionSource === "user" ? "User-created section" : "AI-created section");

      const optionEl = document.createElement("div");
      optionEl.className = `prompt-select-option${isSelected ? " selected" : ""}`;
      optionEl.innerHTML = `
        <div class="prompt-select-option-meta">
          <span class="prompt-select-option-id">${escapeHtml(option.name)}</span>
          <span class="section-origin-pill origin-${sectionSource}">${sourceLabel}</span>
        </div>
        <span class="prompt-select-option-desc">${sectionMeta}</span>
      `;
      optionEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectValue(option, false);
      });
      optionsEl.appendChild(optionEl);
    });

    if (query && !exactMatch && !disableCreate) {
      const typed = searchEl.value.trim();
      const createOptionEl = document.createElement("div");
      createOptionEl.className = `prompt-select-option section-create-option${selectedValue === searchEl.value.trim() && selectedIsNew ? " selected" : ""}`;
      createOptionEl.innerHTML = `
        <span class="prompt-select-option-id"><i class="bi bi-plus-circle me-1"></i>Create "${escapeHtml(typed)}"</span>
        <span class="prompt-select-option-name">Use this as a new section</span>
      `;
      createOptionEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectValue({ name: typed, source: "user", sectionId: null, suiteId: null }, true);
      });
      optionsEl.appendChild(createOptionEl);
    }

    if (!filtered.length && (!query || exactMatch)) {
      optionsEl.innerHTML = '<div class="prompt-select-no-results">No matching sections.</div>';
    }
  }

  function openDropdown() {
    dropdownEl.classList.add("open");
    triggerEl.classList.add("open");
    searchEl.value = "";
    searchEl.focus();
    renderOptions("");
  }

  function closeDropdown() {
    dropdownEl.classList.remove("open");
    triggerEl.classList.remove("open");
  }

  function selectValue(value, isNew) {
    const normalized = normalizeSectionOption(value);
    selectedValue = String(normalized.name || "").trim();
    selectedOption = {
      ...normalized,
      name: selectedValue,
    };
    selectedIsNew = Boolean(isNew);
    valueEl.value = selectedValue;
    renderTrigger();
    closeDropdown();
  }

  triggerEl.addEventListener("click", () => {
    if (dropdownEl.classList.contains("open")) {
      closeDropdown();
      return;
    }
    openDropdown();
  });

  triggerEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDropdown();
    }
  });

  searchEl.addEventListener("input", () => renderOptions(searchEl.value));
  searchEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDropdown();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const typedValue = String(searchEl.value || "").trim();
      if (!typedValue) return;
      const exactExisting = allOptions.find((option) => option.name.toLowerCase() === typedValue.toLowerCase());
      selectValue(exactExisting || { name: typedValue, source: "user", sectionId: null, suiteId: null }, !exactExisting);
    }
  });

  document.addEventListener("click", (event) => {
    if (!wrapEl.contains(event.target)) {
      closeDropdown();
    }
  });

  return {
    setOptions(nextOptions = []) {
      allOptions = dedupeSectionOptions(nextOptions);
      renderOptions(searchEl.value);
    },
    addOptions(nextOptions = []) {
      allOptions = dedupeSectionOptions([...(allOptions || []), ...(nextOptions || [])]);
      renderOptions(searchEl.value);
    },
    setValue(nextValue = "", metadata = {}) {
      const normalizedValue = String(nextValue || "").trim();
      const desiredSectionId = metadata.sectionId != null ? Number(metadata.sectionId) : null;
      const existing = allOptions.find((option) => {
        if (option.name.toLowerCase() !== normalizedValue.toLowerCase()) return false;
        if (desiredSectionId != null && option.sectionId != null) {
          return Number(option.sectionId) === desiredSectionId;
        }
        return true;
      });

      const fallbackOption = normalizeSectionOption({
        name: normalizedValue,
        sectionId: metadata.sectionId,
        suiteId: metadata.suiteId,
        source: metadata.source || metadata.sectionSource || (metadata.sectionId != null ? "testrail" : "ai"),
      });

      selectedValue = existing ? existing.name : normalizedValue;
      selectedOption = existing || fallbackOption;
      selectedIsNew = Boolean(normalizedValue) && !existing;
      valueEl.value = selectedValue;
      searchEl.value = "";
      renderTrigger();
      renderOptions("");
    },
    getValue() {
      return String(valueEl.value || "").trim();
    },
    getSelection() {
      return {
        name: String(selectedOption.name || "").trim(),
        sectionId: selectedOption.sectionId != null ? selectedOption.sectionId : null,
        suiteId: selectedOption.suiteId != null ? selectedOption.suiteId : null,
        source: selectedOption.source || "ai",
        isNew: selectedIsNew,
      };
    },
    focusSearch() {
      openDropdown();
    },
    setDisableCreate(val) {
      disableCreate = Boolean(val);
    },
  };
}

const editSectionPicker = createSectionPicker({
  wrapId: "editTcSectionPickerWrap",
  triggerId: "editTcSectionTrigger",
  triggerTextId: "editTcSectionTriggerText",
  dropdownId: "editTcSectionDropdown",
  searchId: "editTcSectionSearch",
  optionsId: "editTcSectionOptions",
  valueId: "editTcSectionValue",
});

const bulkSectionPicker = createSectionPicker({
  wrapId: "bulkEditSectionPickerWrap",
  triggerId: "bulkEditSectionTrigger",
  triggerTextId: "bulkEditSectionTriggerText",
  dropdownId: "bulkEditSectionDropdown",
  searchId: "bulkEditSectionSearch",
  optionsId: "bulkEditSectionOptions",
  valueId: "bulkEditSectionValue",
});

// --- Per-platform section pickers for "All Platforms" Move Section ---
let bulkMoveMode = "unified"; // "unified" or "per-platform"
let perPlatformPickers = []; // { groupKey, label, picker, container, suiteId }

function buildPerPlatformPickers() {
  const wrap = document.getElementById("bulkMovePerPlatformWrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  perPlatformPickers = [];

  const groups = currentPromptPlatformGroups.length ? currentPromptPlatformGroups : [];
  groups.forEach((opt) => {
    const mapping = (syncConfigData.mappings || []).find(m => m.platformGroup === opt.value);
    const suiteName = mapping?.suiteName || (mapping?.suiteId ? "Suite " + mapping.suiteId : "No suite mapped");

    const container = document.createElement("div");
    container.className = "mb-2 per-platform-picker-group";
    container.innerHTML = `
      <div class="d-flex align-items-center gap-2 mb-1">
        <span class="platform-chip platform-chip-selected" style="pointer-events:none;font-size:0.75rem;padding:2px 8px;"><i class="bi ${opt.icon}"></i> ${escapeHtml(opt.label)}</span>
        <span class="text-muted small">${escapeHtml(suiteName)}</span>
      </div>
      <div class="prompt-select-wrap">
        <div class="prompt-select-trigger" tabindex="0">
          <span class="prompt-select-trigger-text is-placeholder">Search or create section...</span>
          <i class="bi bi-chevron-down" style="font-size:0.75rem;flex-shrink:0;"></i>
        </div>
        <div class="prompt-select-dropdown">
          <input type="text" class="prompt-select-search" placeholder="Search section..." autocomplete="off" />
          <div class="prompt-select-options"></div>
        </div>
      </div>
      <input type="hidden" />
    `;

    wrap.appendChild(container);

    const wrapEl = container.querySelector(".prompt-select-wrap");
    const triggerEl = wrapEl.querySelector(".prompt-select-trigger");
    const dropdownEl = wrapEl.querySelector(".prompt-select-dropdown");
    const searchEl = wrapEl.querySelector(".prompt-select-search");
    const optionsEl = wrapEl.querySelector(".prompt-select-options");
    const valueEl = container.querySelector('input[type="hidden"]');

    const picker = createSectionPicker({
      wrapEl, triggerEl, dropdownEl, searchEl, optionsEl, valueEl,
    });

    perPlatformPickers.push({
      groupKey: opt.value,
      label: opt.label,
      picker,
      container,
      suiteId: mapping?.suiteId || null,
    });
  });
}

async function loadPerPlatformSections() {
  for (const pp of perPlatformPickers) {
    if (!pp.suiteId) {
      // No suite mapped: show only AI/User sections
      const aiUserSections = getSectionOptions().filter(o => o.source !== "testrail");
      pp.picker.setOptions(aiUserSections);
      continue;
    }
    try {
      const queryParam = `?suiteId=${encodeURIComponent(pp.suiteId)}`;
      const response = await apiRequest(`/testrail/getsections${queryParam}`);
      const payload = response?.data ?? response;
      const remoteSections = Array.isArray(payload?.sections) ? payload.sections : [];
      const normalized = remoteSections.map(section => normalizeSectionOption({
        name: section?.name,
        sectionId: section?.id,
        suiteId: section?.suite_id,
        source: "testrail",
        depth: section?.depth,
        parentId: section?.parent_id,
      })).filter(item => item.name);

      // Merge AI/User sections with this platform's TestRail sections
      const aiUserSections = getSectionOptions().filter(o => o.source !== "testrail");
      pp.picker.setOptions(dedupeSectionOptions([...aiUserSections, ...normalized]));
    } catch (error) {
      // On error, still show AI/User sections
      const aiUserSections = getSectionOptions().filter(o => o.source !== "testrail");
      pp.picker.setOptions(aiUserSections);
    }
  }
}

function setBulkMoveMode(mode) {
  bulkMoveMode = mode;
  const unifiedWrap = document.getElementById("bulkMoveUnifiedWrap");
  const perPlatformWrap = document.getElementById("bulkMovePerPlatformWrap");
  const modeUnifiedBtn = document.getElementById("bulkMoveModeUnified");
  const modePerPlatformBtn = document.getElementById("bulkMoveModePerPlatform");

  if (mode === "per-platform") {
    if (unifiedWrap) unifiedWrap.style.display = "none";
    if (perPlatformWrap) perPlatformWrap.style.display = "";
    if (modeUnifiedBtn) modeUnifiedBtn.classList.remove("active");
    if (modePerPlatformBtn) modePerPlatformBtn.classList.add("active");
  } else {
    if (unifiedWrap) unifiedWrap.style.display = "";
    if (perPlatformWrap) perPlatformWrap.style.display = "none";
    if (modeUnifiedBtn) modeUnifiedBtn.classList.add("active");
    if (modePerPlatformBtn) modePerPlatformBtn.classList.remove("active");
  }
}

document.getElementById("bulkMoveModeUnified")?.addEventListener("click", () => setBulkMoveMode("unified"));
document.getElementById("bulkMoveModePerPlatform")?.addEventListener("click", () => {
  setBulkMoveMode("per-platform");
  if (perPlatformPickers.length === 0) {
    buildPerPlatformPickers();
    loadPerPlatformSections();
  }
});

// --- INLINE SECTION RENAME ---
function startInlineEditSection(sectionRow, section, namePart) {
  // Prevent multiple inline edits at once
  if (document.querySelector(".section-inline-edit-wrap")) return;

  const originalName = section.name;
  const countSuffix = ` (${section.testcases.length})`;

  const wrap = document.createElement("span");
  wrap.className = "section-inline-edit-wrap d-flex align-items-center gap-1";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "form-control form-control-sm section-inline-edit-input";
  input.value = originalName;
  input.maxLength = 120;

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "btn btn-sm btn-primary section-inline-edit-confirm";
  confirmBtn.title = "Save";
  confirmBtn.innerHTML = '<i class="bi bi-check-lg"></i>';

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-sm btn-outline-secondary section-inline-edit-cancel";
  cancelBtn.title = "Cancel";
  cancelBtn.innerHTML = '<i class="bi bi-x-lg"></i>';

  wrap.appendChild(input);
  wrap.appendChild(confirmBtn);
  wrap.appendChild(cancelBtn);

  namePart.style.display = "none";
  // Hide action buttons (edit/add) during inline edit
  const actionBtns = namePart.parentNode.querySelectorAll(".section-action-btn");
  actionBtns.forEach(btn => btn.style.display = "none");
  namePart.parentNode.insertBefore(wrap, namePart.nextSibling);

  input.focus();
  input.select();

  const cleanup = () => {
    wrap.remove();
    namePart.style.display = "";
    // Restore action buttons
    actionBtns.forEach(btn => btn.style.display = "");
  };

  const save = async () => {
    const newName = input.value.trim();
    if (!newName || newName === originalName) {
      cleanup();
      return;
    }

    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    input.disabled = true;

    try {
      await apiRequest(`/testcase/editSection?promptID=${encodeURIComponent(currentScopePromptId)}`, {
        method: "PUT",
        body: JSON.stringify({
          promptId: currentScopePromptId,
          currentName: originalName,
          newName: newName,
          sectionId: section.sectionId ?? null,
        }),
      });

      // Update local data
      allTestCases = allTestCases.map(tc =>
        (tc.section || "").toLowerCase() === originalName.toLowerCase()
          ? { ...tc, section: newName }
          : tc
      );

      const prevSection = selectedSection === originalName ? newName : selectedSection;
      buildSectionsFromCases();
      renderSections();
      renderAllTestCases();
      selectSection(prevSection);

      showBanner("Section renamed successfully.", "success");
    } catch (err) {
      showBanner("Failed to rename section: " + (err.message || "Unknown error"), "danger");
      cleanup();
    }
  };

  confirmBtn.addEventListener("click", (e) => { e.stopPropagation(); save(); });
  cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); cleanup(); });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") { cleanup(); }
  });
  input.addEventListener("click", (e) => e.stopPropagation());
}

// --- ADD TEST CASE MODAL ---
let isAddMode = false;
let addTargetSection = null;

function openAddTestCaseModal(section) {
  isAddMode = true;
  addTargetSection = section;

  // Update modal header to reflect add mode
  const modalTitle = document.getElementById("editTestCaseModalLabel");
  const modalSub = document.querySelector(".tc-bloom-modal-sub");
  const saveBtn = document.querySelector("#editTestCaseForm .tc-save-btn");
  const iconWrap = document.querySelector(".tc-bloom-icon-edit");

  modalTitle.textContent = "Add Test Case";
  if (modalSub) modalSub.textContent = `Adding to section: ${section.name}`;
  if (saveBtn) saveBtn.innerHTML = '<i class="bi bi-plus-circle me-1"></i>Add Test Case';
  if (iconWrap) iconWrap.innerHTML = '<i class="bi bi-plus-circle"></i>';

  // Set section picker to the target section (locked)
  const sectionOptions = getSectionOptions();
  editSectionPicker.setOptions(sectionOptions);
  editSectionPicker.setValue(section.name, {
    sectionId: section.sectionId,
    suiteId: section.suiteId,
    source: section.source,
  });

  // Clear all fields
  document.getElementById("editTcId").value = "";
  document.getElementById("editTcPromptId").value = currentScopePromptId || "";
  document.getElementById("editTcTitle").value = "";
  document.getElementById("editTcPreconditions").value = "";
  renderStepEditorRows([{ content: "", expected: "" }]);
  document.getElementById("editTcExpected").value = "";

  // Default all platforms selected for new test cases
  renderEditModalPlatformChips(EDIT_PLATFORM_OPTIONS.map(o => o.value));

  editTestCaseModal.show();
}

function resetEditModalToEditMode() {
  isAddMode = false;
  addTargetSection = null;

  const modalTitle = document.getElementById("editTestCaseModalLabel");
  const modalSub = document.querySelector(".tc-bloom-modal-sub");
  const saveBtn = document.querySelector("#editTestCaseForm .tc-save-btn");
  const iconWrap = document.querySelector(".tc-bloom-icon-edit");

  modalTitle.textContent = "Edit Test Case";
  if (modalSub) modalSub.textContent = "Update test details and section";
  if (saveBtn) saveBtn.innerHTML = '<i class="bi bi-floppy me-1"></i>Save Changes';
  if (iconWrap) iconWrap.innerHTML = '<i class="bi bi-pencil-square"></i>';
}

// Reset modal mode when hidden
document.getElementById("editTestCaseModal").addEventListener("hidden.bs.modal", () => {
  resetEditModalToEditMode();
});

// --- Edit modal platform chip selector ---
function renderEditModalPlatformChips(selectedPlatforms = []) {
  const container = document.getElementById("editTcPlatformOptions");
  if (!container) return;
  container.innerHTML = "";
  const selected = new Set(selectedPlatforms);
  EDIT_PLATFORM_OPTIONS.forEach(opt => {
    const chip = document.createElement("span");
    chip.className = "platform-chip" + (selected.has(opt.value) ? " platform-chip-selected" : "");
    chip.dataset.value = opt.value;
    chip.innerHTML = `<i class="bi ${opt.icon} me-1"></i>${opt.label}`;
    chip.addEventListener("click", () => {
      chip.classList.toggle("platform-chip-selected");
    });
    container.appendChild(chip);
  });
}

function getEditModalPlatforms() {
  const container = document.getElementById("editTcPlatformOptions");
  if (!container) return [];
  return Array.from(container.querySelectorAll(".platform-chip-selected"))
    .map(el => el.dataset.value)
    .filter(Boolean);
}

function openEditModal(tc) {
  const sectionOptions = getSectionOptions();
  const currentSection = String(tc.section || "").trim();

  editSectionPicker.setOptions(sectionOptions);
  editSectionPicker.setValue(currentSection, {
    sectionId: tc.sectionId,
    suiteId: tc.suiteId,
    source: tc.sectionSource,
  });

  document.getElementById("editTcId").value = tc.id || "";
  document.getElementById("editTcPromptId").value = currentScopePromptId || "";
  document.getElementById("editTcTitle").value = tc.title || "";
  document.getElementById("editTcPreconditions").value = tc.preconditions || "";
  renderStepEditorRows(tc.steps);
  document.getElementById("editTcExpected").value = tc.expected || "";
  // Populate platform chips in edit modal
  renderEditModalPlatformChips(Array.isArray(tc.platforms) ? tc.platforms : []);
  editTestCaseModal.show();
}

editTestCaseForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const tcId = document.getElementById("editTcId").value;
  const promptId = document.getElementById("editTcPromptId").value;
  const resolvedSection = editSectionPicker.getValue();
  const resolvedSelection = editSectionPicker.getSelection();

  if (!resolvedSection) {
    showBanner("Section is required.", "danger");
    return;
  }

  const steps = collectStepsFromEditor();
  if (!steps.length) {
    showBanner("At least one step with an action is required.", "danger");
    return;
  }

  // --- ADD MODE ---
  if (isAddMode) {
    const title = document.getElementById("editTcTitle").value.trim();
    if (!title) {
      showBanner("Title is required.", "danger");
      return;
    }

    const newTc = {
      promptId: promptId,
      section: resolvedSection,
      sectionId: resolvedSelection.sectionId,
      suiteId: resolvedSelection.suiteId,
      sectionSource: resolvedSelection.source,
      platformGroup: getActivePlatformGroup() || undefined,
      title: title,
      preconditions: document.getElementById("editTcPreconditions").value.trim(),
      steps: steps,
      expected: document.getElementById("editTcExpected").value.trim(),
      expectedResult: document.getElementById("editTcExpected").value.trim(),
      platforms: getEditModalPlatforms(),
    };

    try {
      const result = await apiRequest(`/testcase/add?promptID=${encodeURIComponent(promptId)}`, {
        method: "POST",
        body: JSON.stringify(newTc),
      });

      // Reload full scope to get updated per-platform section meta from backend
      const added = result?.data?.addedTestCase || {};
      await loadTestScope(promptId);

      const prevSection = selectedSection;
      const sectionNames = sections.map(s => s.name);
      if (prevSection && prevSection !== "all" && sectionNames.includes(prevSection)) {
        selectSection(prevSection);
      } else {
        selectSection("all");
      }

      editTestCaseModal.hide();
      showBanner(`Test case ${added.id || ""} added successfully.`, "success");
    } catch (err) {
      showBanner("Failed to add test case: " + err.message, "danger");
    }
    return;
  }

  // --- EDIT MODE (existing behavior) ---
  const updated = {
    id: tcId,
    promptId: promptId,
    title: document.getElementById("editTcTitle").value.trim(),
    section: resolvedSection,
    sectionId: resolvedSelection.sectionId,
    suiteId: resolvedSelection.suiteId,
    sectionSource: resolvedSelection.source,
    platformGroup: getActivePlatformGroup() || undefined,
    preconditions: document.getElementById("editTcPreconditions").value.trim(),
    steps: steps,
    expected: document.getElementById("editTcExpected").value.trim(),
    platforms: getEditModalPlatforms(),
  };

  try {
    await apiRequest(`/testcase/edit?testcaseId=${encodeURIComponent(tcId)}&promptID=${encodeURIComponent(promptId)}`, {
      method: "POST",
      body: JSON.stringify(updated),
    });

    // Reload full scope to get updated per-platform section meta from backend
    await loadTestScope(promptId);

    const prevSection = selectedSection;
    const sectionNames = sections.map(s => s.name);
    if (prevSection && prevSection !== "all" && sectionNames.includes(prevSection)) {
      selectSection(prevSection);
    } else {
      selectSection("all");
    }

    editTestCaseModal.hide();
    showBanner("Test case updated successfully.", "success");
  } catch (err) {
    showBanner("Failed to update test case: " + err.message, "danger");
  }
});

// Delete
const deleteTcOverlay   = document.getElementById("deleteTcOverlay");
const deleteTcCancelBtn  = document.getElementById("deleteTcCancelBtn");
const confirmDeleteBtn   = document.getElementById("confirmDeleteBtn");

deleteTcCancelBtn.addEventListener("click", () => { deleteTcOverlay.classList.remove("open"); });
deleteTcOverlay.addEventListener("click", (e) => { if (e.target === deleteTcOverlay) deleteTcOverlay.classList.remove("open"); });

function openDeleteModal(tc) {
  document.getElementById("deleteTcId").value = tc.id || "";
  document.getElementById("deleteTcPromptId").value = currentScopePromptId || "";
  document.getElementById("deleteTcOverlayBadge").textContent = tc.id ? `${tc.id} — ${tc.title || ""}` : (tc.title || "");
  deleteTcOverlay.classList.add("open");
}

confirmDeleteBtn.addEventListener("click", async () => {
  const tcId = document.getElementById("deleteTcId").value;
  const promptId = document.getElementById("deleteTcPromptId").value;

  confirmDeleteBtn.disabled = true;
  confirmDeleteBtn.textContent = "Deleting...";

  try {
    await apiRequest(`/testcase/deleteTestCase/${encodeURIComponent(promptId)}/${encodeURIComponent(tcId)}`, {
      method: "DELETE",
    });

    // Remove from local data
    allTestCases = allTestCases.filter(tc => tc.id !== tcId);

    // Rebuild sections and keep selection if possible
    const prevSection = selectedSection;
    buildSectionsFromCases();
    renderSections();

    if (allTestCases.length) {
      renderAllTestCases();

      const sectionNames = sections.map(s => s.name);
      if (prevSection && prevSection !== "all" && sectionNames.includes(prevSection)) {
        selectSection(prevSection);
      } else {
        selectSection("all");
      }
    } else {
      sectionListEl.innerHTML = '<div class="text-muted small">No sections available.</div>';
      testCaseTableBody.innerHTML = `
        <tr><td colspan="3" class="text-center text-muted small">
          No test cases available.
        </td></tr>`;
      selectedSectionTitle.textContent = "All Test Cases";
    }

    deleteTcOverlay.classList.remove("open");
    showBanner("Test case deleted successfully.", "success");
  } catch (err) {
    showBanner("Failed to delete test case: " + err.message, "danger");
  } finally {
    confirmDeleteBtn.disabled = false;
    confirmDeleteBtn.textContent = "Delete";
  }
});

// --- TEST CASE SELECTION HELPERS ---
function updateBulkBar() {
  const count = selectedTcIds.size;
  const bulkBar = document.getElementById("tcBulkBar");
  const bulkCount = document.getElementById("tcBulkCount");
  if (bulkCount) bulkCount.textContent = count + " selected";
  if (bulkBar) bulkBar.style.display = (isSelectMode && count > 0) ? "flex" : "none";

  // Post to TestRail is always enabled when a prompt is loaded (both single platform and "All" modes)
  const postBtn = document.getElementById("tcBulkPostTestrailBtn");
  if (postBtn) {
    const noPrompt = !currentScopePromptId;
    postBtn.disabled = noPrompt;
    postBtn.title = noPrompt ? "Select a prompt before posting to TestRail" : "Post to TestRail";
  }
}

function updateSelectAllState() {
  const selectAll = document.getElementById("tcSelectAll");
  if (!selectAll) return;
  const rows = Array.from(testCaseTableBody.querySelectorAll(".testcase-row"));
  const ids = rows.map(r => r.dataset.tcId).filter(Boolean);
  if (!ids.length) { selectAll.checked = false; selectAll.indeterminate = false; }
  else {
    const checked = ids.filter(id => selectedTcIds.has(id)).length;
    selectAll.checked = checked === ids.length;
    selectAll.indeterminate = checked > 0 && checked < ids.length;
  }

  // Sync each section's checkbox state and visibility
  testCaseTableBody.querySelectorAll(".section-select-all-cb").forEach(sectionCb => {
    const wrap = sectionCb.closest(".section-cb-wrap");
    if (wrap) wrap.style.display = isSelectMode ? "inline-flex" : "none";
    const sName = sectionCb.dataset.sectionName;
    if (!sName) return;
    const sRows = Array.from(testCaseTableBody.querySelectorAll(`.testcase-row[data-section="${CSS.escape(sName)}"]`));
    const sIds = sRows.map(r => r.dataset.tcId).filter(Boolean);
    if (!sIds.length) { sectionCb.checked = false; sectionCb.indeterminate = false; return; }
    const sChecked = sIds.filter(id => selectedTcIds.has(id)).length;
    sectionCb.checked = sChecked === sIds.length;
    sectionCb.indeterminate = sChecked > 0 && sChecked < sIds.length;
  });
}

const bulkFetchTestrailBtn = document.getElementById("bulkFetchTestrailBtn");
const bulkEditSectionStatus = document.getElementById("bulkEditSectionStatus");

function setBulkSectionStatus(message = "", type = "muted") {
  if (!bulkEditSectionStatus) return;
  bulkEditSectionStatus.textContent = message;
  bulkEditSectionStatus.classList.remove("text-muted", "text-danger", "text-success");
  bulkEditSectionStatus.classList.add(
    type === "danger" ? "text-danger" : type === "success" ? "text-success" : "text-muted"
  );
}

function getSectionOptions() {
  const fromSections = sections.map((s) => ({
    name: String(s?.name || "").trim(),
    sectionId: s?.sectionId ?? null,
    suiteId: s?.suiteId ?? null,
    source: s?.source || (s?.sectionId != null ? "testrail" : "ai"),
  })).filter((item) => item.name);

  const fromCases = allTestCases.map((tc) => ({
    name: String(tc?.section || "").trim(),
    sectionId: tc?.sectionId ?? null,
    suiteId: tc?.suiteId ?? null,
    source: tc?.sectionSource || (tc?.sectionId != null ? "testrail" : "ai"),
  })).filter((item) => item.name);

  return dedupeSectionOptions([...(fromSections || []), ...(fromCases || []), ...(testrailSectionsCache || [])]);
}

async function fetchTestrailSuitesForPicker() {
  if (isFetchingTestrailSuites) return;

  isFetchingTestrailSuites = true;
  bulkFetchTestrailBtn.disabled = true;
  bulkFetchTestrailBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Fetching...';
  setBulkSectionStatus("Fetching test suites from TestRail...", "muted");

  const suitePickerWrap = document.getElementById("bulkSuitePickerWrap");
  const suitePicker = document.getElementById("bulkSuitePicker");
  const suiteStatus = document.getElementById("bulkSuiteStatus");

  try {
    const response = await apiRequest("/testrail/getsuites");
    const payload = response?.data ?? response;
    const suites = Array.isArray(payload?.suites) ? payload.suites : [];

    testrailSuitesCache = suites;

    if (!suites.length) {
      // Single-suite project or no suites — skip suite picker, fetch sections directly
      suitePickerWrap.style.display = "none";
      setBulkSectionStatus("Fetching sections...", "muted");
      await fetchTestrailSectionsForSuite("");
      return;
    }

    // Populate suite dropdown
    suitePicker.innerHTML = '<option value="" disabled selected>Select a test suite...</option>';
    suites.forEach((suite) => {
      const opt = document.createElement("option");
      opt.value = String(suite.id);
      opt.textContent = suite.name + (suite.is_master ? " (Master)" : "");
      suitePicker.appendChild(opt);
    });

    // Restore previous selection if available
    if (selectedTestrailSuiteId) {
      suitePicker.value = String(selectedTestrailSuiteId);
    }

    suitePickerWrap.style.display = "";
    if (suiteStatus) {
      suiteStatus.innerHTML = `<span class="text-muted small">${suites.length} suite(s) found. Select one to load its sections.</span>`;
    }
    setBulkSectionStatus("Select a test suite to load its sections.", "muted");
  } catch (error) {
    setBulkSectionStatus(`Failed to fetch TestRail suites: ${error.message}`, "danger");
    suitePickerWrap.style.display = "none";
  } finally {
    isFetchingTestrailSuites = false;
    bulkFetchTestrailBtn.disabled = false;
    bulkFetchTestrailBtn.innerHTML = '<i class="bi bi-cloud-download me-1"></i>Get from TestRail';
  }
}

async function fetchTestrailSectionsForSuite(suiteId) {
  if (isFetchingTestrailSections) return;

  isFetchingTestrailSections = true;
  const suiteStatus = document.getElementById("bulkSuiteStatus");
  if (suiteStatus) {
    suiteStatus.innerHTML = '<span class="text-muted small"><span class="spinner-border spinner-border-sm me-1" role="status"></span>Loading sections...</span>';
  }
  setBulkSectionStatus("Fetching sections from TestRail...", "muted");

  try {
    const queryParam = suiteId ? `?suiteId=${encodeURIComponent(suiteId)}` : "";
    const response = await apiRequest(`/testrail/getsections${queryParam}`);
    const payload = response?.data ?? response;
    const remoteSections = Array.isArray(payload?.sections) ? payload.sections : [];

    selectedTestrailSuiteId = suiteId;

    testrailSectionsCache = remoteSections
      .map((section) => normalizeSectionOption({
        name: section?.name,
        sectionId: section?.id,
        suiteId: section?.suite_id,
        source: "testrail",
        depth: section?.depth,
        parentId: section?.parent_id,
      }))
      .filter((item) => item.name);

    bulkSectionPicker.setOptions(getSectionOptions());

    const suiteName = testrailSuitesCache.find((s) => String(s.id) === String(suiteId))?.name || `Suite ${suiteId}`;
    if (suiteStatus) {
      suiteStatus.innerHTML = `<span class="text-success small"><i class="bi bi-check-circle me-1"></i>${remoteSections.length} section(s) loaded.</span>`;
    }
    setBulkSectionStatus(`Loaded ${testrailSectionsCache.length} section(s) from "${suiteName}".`, "success");
  } catch (error) {
    setBulkSectionStatus(`Failed to fetch sections: ${error.message}`, "danger");
    if (suiteStatus) {
      suiteStatus.innerHTML = `<span class="text-danger small">${error.message}</span>`;
    }
  } finally {
    isFetchingTestrailSections = false;
  }
}

// Wire up suite picker change event
document.getElementById("bulkSuitePicker").addEventListener("change", (e) => {
  const suiteId = e.target.value;
  if (suiteId) {
    fetchTestrailSectionsForSuite(suiteId);
  }
});

if (bulkFetchTestrailBtn) {
  bulkFetchTestrailBtn.addEventListener("click", fetchTestrailSuitesForPicker);
}

function openBulkEditSectionDialog(sectionNames) {
  return new Promise(async function(resolve) {
    const overlay    = document.getElementById("bulkEditSectionOverlay");
    const sub        = document.getElementById("bulkEditSectionSub");
    const confirmBtn = document.getElementById("bulkEditSectionConfirmBtn");
    const cancelBtn  = document.getElementById("bulkEditSectionCancelBtn");
    const modeWrap   = document.getElementById("bulkMoveModeWrap");

    const isAllPlatforms = selectedPlatformFilters.size === 0;
    const hasMultiplePlatforms = currentPromptPlatformGroups.length > 1;

    sub.textContent = "Move " + selectedTcIds.size + " test case(s) to a section";

    // Reset mode state
    bulkMoveMode = "unified";
    perPlatformPickers = [];
    setBulkMoveMode("unified");

    // Show mode toggle only when All Platforms is active AND multiple platform groups exist
    if (modeWrap) {
      modeWrap.style.display = (isAllPlatforms && hasMultiplePlatforms) ? "" : "none";
    }

    // For unified mode: when All Platforms is active, filter out TestRail sections (physical move only to AI/user)
    // When single platform is filtered, show all sections (flat model: per-platform meta is per-TC, safe for any section)
    const isSinglePlatform = selectedPlatformFilters.size === 1;
    let unifiedOptions;
    if (isAllPlatforms && hasMultiplePlatforms) {
      unifiedOptions = sectionNames.filter(o => o.source !== "testrail");
    } else {
      unifiedOptions = sectionNames;
    }
    bulkSectionPicker.setOptions(unifiedOptions);
    bulkSectionPicker.setValue("");
    bulkSectionPicker.setDisableCreate(false);

    if (isSinglePlatform) {
      setBulkSectionStatus("Per-platform mode: section metadata will be set for the selected platform only.", "muted");
    } else {
      setBulkSectionStatus("click \"Get from TestRail\" to sync remote sections.", "muted");
    }

    // Reset suite picker if no suites fetched yet
    const suitePickerWrap = document.getElementById("bulkSuitePickerWrap");
    if (suitePickerWrap && !testrailSuitesCache.length) {
      suitePickerWrap.style.display = "none";
    }

    // Hide "Get from TestRail" button and suite picker when All Platforms + multiple groups (unified mode shows only AI/User)
    const fetchBtn = document.getElementById("bulkFetchTestrailBtn");
    if (isAllPlatforms && hasMultiplePlatforms) {
      if (fetchBtn) fetchBtn.style.display = "none";
      if (suitePickerWrap) suitePickerWrap.style.display = "none";
    } else {
      if (fetchBtn) fetchBtn.style.display = "";
    }

    // Auto-load mapped suite if single platform filter is active
    if (selectedPlatformFilters.size === 1) {
      const groupKey = [...selectedPlatformFilters][0];
      const mapping = (syncConfigData.mappings || []).find(m => m.platformGroup === groupKey);
      if (mapping?.suiteId) {
        await fetchTestrailSuitesForPicker();
        const suitePicker = document.getElementById("bulkSuitePicker");
        if (suitePicker) {
          suitePicker.value = String(mapping.suiteId);
          await fetchTestrailSectionsForSuite(mapping.suiteId);
          const groupLabel = PLATFORM_OPTIONS.find(o => o.value === groupKey)?.label || groupKey;
          setBulkSectionStatus(`Auto-loaded sections from "${mapping.suiteName || "Suite " + mapping.suiteId}" (mapped to ${groupLabel}).`, "info");
        }
      }
    }

    overlay.classList.add("open");
    setTimeout(function(){ bulkSectionPicker.focusSearch(); }, 50);

    function cleanup() {
      overlay.classList.remove("open");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
      // Reset per-platform pickers
      const ppWrap = document.getElementById("bulkMovePerPlatformWrap");
      if (ppWrap) ppWrap.innerHTML = "";
      perPlatformPickers = [];
      // Restore fetch button visibility
      if (fetchBtn) fetchBtn.style.display = "";
    }
    function onConfirm()  {
      if (bulkMoveMode === "per-platform" && perPlatformPickers.length > 0) {
        // Resolve per-platform selections
        const perPlatformSelections = perPlatformPickers.map(pp => {
          const sel = pp.picker.getSelection();
          return {
            groupKey: pp.groupKey,
            label: pp.label,
            selection: sel && sel.name ? sel : null,
          };
        }).filter(pp => pp.selection);
        cleanup();
        resolve({ mode: "per-platform", perPlatformSelections });
      } else {
        const resolved = bulkSectionPicker.getSelection();
        cleanup();
        resolve(resolved && resolved.name ? { mode: "unified", selection: resolved } : null);
      }
    }
    function onCancel()   { cleanup(); resolve(null); }
    function onBackdrop(e){ if (e.target === overlay) onCancel(); }
    function onKeydown(e) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && !document.getElementById("bulkEditSectionDropdown")?.classList.contains("open")) {
        onConfirm();
      }
    }
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

function openBulkDeleteConfirmDialog(count) {
  return new Promise(function(resolve) {
    const overlay    = document.getElementById("bulkDeleteOverlay");
    const sub        = document.getElementById("bulkDeleteSub");
    const confirmBtn = document.getElementById("bulkDeleteConfirmBtn");
    const cancelBtn  = document.getElementById("bulkDeleteCancelBtn");
    sub.textContent = "This will permanently delete " + count + " test case(s). This cannot be undone.";
    overlay.classList.add("open");
    function cleanup() {
      overlay.classList.remove("open");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
    }
    function onConfirm()  { cleanup(); resolve(true); }
    function onCancel()   { cleanup(); resolve(false); }
    function onBackdrop(e){ if (e.target === overlay) onCancel(); }
    function onKeydown(e) { if (e.key === "Escape") onCancel(); }
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

function getSelectedTestCases() {
  if (!selectedTcIds.size) return [];
  const selectedIds = new Set(Array.from(selectedTcIds).map((id) => String(id || "").trim()));
  return allTestCases.filter((tc) => selectedIds.has(String(tc.id || "").trim()));
}

function summarizeSelectionForTestrailPosting() {
  const selectedCases = getSelectedTestCases();
  const isAllPlatforms = selectedPlatformFilters.size === 0;
  const activeGroups = isAllPlatforms
    ? currentPromptPlatformGroups.map(o => o.value)
    : [...selectedPlatformFilters];

  // Build per-platform-group breakdown
  const platformBreakdown = activeGroups.map(groupKey => {
    const opt = PLATFORM_OPTIONS.find(o => o.value === groupKey);
    const groupPlatforms = opt ? opt.platforms : [groupKey];
    const groupPlatformSet = new Set(groupPlatforms);
    const mapping = (syncConfigData.mappings || []).find(m => m.platformGroup === groupKey);

    const matchingCases = selectedCases.filter(tc => {
      const tcPlatforms = Array.isArray(tc.platforms) ? tc.platforms : [];
      return tcPlatforms.some(p => groupPlatformSet.has(p));
    });

    const eligible = matchingCases.filter(tc => !hasPostedToTestrailFrontend(tc, groupKey));
    const skipped = matchingCases.filter(tc => hasPostedToTestrailFrontend(tc, groupKey));

    return {
      groupKey,
      label: opt?.label || groupKey,
      suiteName: mapping?.suiteName || ("Suite " + (mapping?.suiteId || "?")),
      suiteId: mapping?.suiteId || null,
      totalCases: matchingCases.length,
      eligibleCount: eligible.length,
      skippedCount: skipped.length,
    };
  });

  // For backward-compat: compute overall eligible/skipped from union of all groups
  // Use the single-group logic when only one group active
  const platformGroupKey = activeGroups.length === 1 ? activeGroups[0] : null;
  const eligibleCases = selectedCases.filter((tc) => {
    if (platformGroupKey) return !hasPostedToTestrailFrontend(tc, platformGroupKey);
    // Multi-platform: eligible if not posted to ALL active groups
    return activeGroups.some(gk => {
      const opt = PLATFORM_OPTIONS.find(o => o.value === gk);
      const gPlatforms = opt ? new Set(opt.platforms) : new Set([gk]);
      const tcPlatforms = Array.isArray(tc.platforms) ? tc.platforms : [];
      const matchesPlatform = tcPlatforms.some(p => gPlatforms.has(p));
      return matchesPlatform && !hasPostedToTestrailFrontend(tc, gk);
    });
  });
  const skippedCases = selectedCases.filter((tc) => !eligibleCases.includes(tc));

  const sectionMap = new Map();
  eligibleCases.forEach((tc) => {
    const sectionName = String(tc.section || "Uncategorized").trim() || "Uncategorized";
    const key = tc.sectionId != null
      ? `id:${tc.sectionId}`
      : `name:${sectionName.toLowerCase()}`;

    if (!sectionMap.has(key)) {
      const source = String(tc.sectionSource || "").trim().toLowerCase();
      const isExisting = (tc.sectionId != null && !(typeof tc.sectionId === "string" && tc.sectionId.startsWith("sec_"))) || source === "testrail";

      sectionMap.set(key, {
        key,
        name: sectionName,
        isExisting,
      });
    }
  });

  const selectedSections = Array.from(sectionMap.values());
  const existingSections = selectedSections.filter((section) => section.isExisting);
  const newSections = selectedSections.filter((section) => !section.isExisting);

  return {
    selectedCases,
    eligibleCases,
    skippedCases,
    selectedSections,
    existingSections,
    newSections,
    platformBreakdown,
    isAllPlatforms,
  };
}

function openBulkPostToTestrailDialog(summary) {
  return new Promise(function(resolve) {
    const overlay = document.getElementById("bulkPostTestrailOverlay");
    const sub = document.getElementById("bulkPostTestrailSub");
    const status = document.getElementById("bulkPostTestrailStatus");
    const confirmBtn = document.getElementById("bulkPostTestrailConfirmBtn");
    const cancelBtn = document.getElementById("bulkPostTestrailCancelBtn");

    const selectedCountEl = document.getElementById("bulkPostSelectedCount");
    const sectionCountEl = document.getElementById("bulkPostSectionCount");
    const existingCountEl = document.getElementById("bulkPostExistingCount");
    const newCountEl = document.getElementById("bulkPostNewCount");

    if (selectedCountEl) selectedCountEl.textContent = String(summary.eligibleCases.length);
    if (sectionCountEl) sectionCountEl.textContent = String(summary.selectedSections.length);
    if (existingCountEl) existingCountEl.textContent = String(summary.existingSections.length);
    if (newCountEl) newCountEl.textContent = String(summary.newSections.length);

    // Render platform breakdown
    const breakdownWrap = document.getElementById("bulkPostPlatformBreakdown");
    const breakdownList = document.getElementById("bulkPostPlatformList");
    if (breakdownWrap && breakdownList && summary.platformBreakdown && summary.platformBreakdown.length > 0) {
      breakdownList.innerHTML = summary.platformBreakdown.map(pb => {
        const badge = pb.skippedCount > 0
          ? `<span class="small text-muted ms-1">(${pb.skippedCount} already posted)</span>`
          : "";
        return `<li><span><strong>${escapeHtml(pb.label)}</strong> <span class="text-muted small">${escapeHtml(pb.suiteName)}</span></span><span class="count">${pb.eligibleCount}${badge}</span></li>`;
      }).join("");
      breakdownWrap.style.display = "";
    } else if (breakdownWrap) {
      breakdownWrap.style.display = "none";
    }

    if (sub) {
      const platformNote = summary.isAllPlatforms ? " across all platform suites" : "";
      sub.textContent = summary.skippedCases.length
        ? `Post ${summary.eligibleCases.length} test case(s) to TestRail${platformNote}. Skip ${summary.skippedCases.length} already posted.`
        : `Post ${summary.eligibleCases.length} selected test case(s) to TestRail${platformNote}.`;
    }

    if (status) {
      const newNames = summary.newSections.map((item) => item.name).slice(0, 4);
      if (!summary.eligibleCases.length && summary.skippedCases.length) {
        status.textContent = `All selected test cases are already posted to TestRail and will be skipped.`;
      } else if (newNames.length) {
        const overflow = summary.newSections.length > newNames.length ? ` +${summary.newSections.length - newNames.length} more` : "";
        const skippedText = summary.skippedCases.length ? ` Skipping ${summary.skippedCases.length} already posted case(s).` : "";
        status.textContent = `New sections: ${newNames.join(", ")}${overflow}.${skippedText}`;
      } else {
        status.textContent = summary.skippedCases.length
          ? `All selected sections already exist in TestRail. Skipping ${summary.skippedCases.length} already posted case(s).`
          : "All selected sections already exist in TestRail.";
      }
    }

    overlay.classList.add("open");

    function cleanup() {
      overlay.classList.remove("open");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
    }

    function onConfirm() {
      cleanup();
      resolve(true);
    }

    function onCancel() {
      cleanup();
      resolve(false);
    }

    function onBackdrop(e) {
      if (e.target === overlay) onCancel();
    }

    function onKeydown(e) {
      if (e.key === "Escape") onCancel();
    }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

async function handleBulkPostToTestrail() {
  if (!selectedTcIds.size) return;
  if (!currentScopePromptId) {
    showBanner("Please select a prompt before posting to TestRail.", "danger");
    return;
  }

  // Determine which platform groups will be posted to
  const activeGroups = selectedPlatformFilters.size > 0
    ? [...selectedPlatformFilters]
    : currentPromptPlatformGroups.map(o => o.value);

  // Check sync config exists for all active platform groups
  const missingConfigs = activeGroups.filter(groupKey =>
    !(syncConfigData.mappings || []).some(m => m.platformGroup === groupKey)
  );
  if (missingConfigs.length > 0) {
    const labels = missingConfigs.map(k => PLATFORM_OPTIONS.find(o => o.value === k)?.label || k).join(", ");
    showBanner(`No TestRail sync config found for: ${labels}. Configure platform-to-suite mappings in Settings > TestRail Sync before posting.`, "danger");
    return;
  }

  const summary = summarizeSelectionForTestrailPosting();
  if (!summary.selectedCases.length) {
    showBanner("No valid test cases selected for posting.", "danger");
    return;
  }

  if (!summary.eligibleCases.length) {
    showBanner(`Skipped ${summary.skippedCases.length} test case(s): all selected items were already posted to TestRail.`, "success");
    return;
  }

  const confirmed = await openBulkPostToTestrailDialog(summary);
  if (!confirmed) return;

  try {
    setPageBlockingOverlay(true, "Posting selected test cases to TestRail...");
    const isAllPlatforms = selectedPlatformFilters.size === 0;
    const platformGroups = isAllPlatforms
      ? currentPromptPlatformGroups.map(o => o.value)
      : [...selectedPlatformFilters];
    const payload = {
      promptId: currentScopePromptId,
      testcaseIds: Array.from(selectedTcIds),
      platformFilter: Array.from(expandPlatformFilter(new Set(platformGroups))),
      platformGroups: platformGroups,
    };

    const response = await apiRequest("/testrail/posttestcases", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const result = response?.data || {};
    await loadTestScope(currentScopePromptId);

    const posted = Number(result?.totalPosted || 0);
    const failed = Number(result?.totalFailed || 0);
    const skipped = Number(result?.totalSkipped || 0);
    if (failed > 0) {
      const skippedText = skipped > 0 ? `, skipped ${skipped} already posted` : "";
      showBanner(`Posted ${posted} test case(s), failed ${failed}${skippedText}. See section post status in testcases JSON.`, "danger");
    } else {
      const skippedText = skipped > 0 ? ` Skipped ${skipped} already posted test case(s).` : "";
      showBanner(`Successfully posted ${posted} test case(s) to TestRail.${skippedText}`, "success");
    }
  } catch (error) {
    showBanner("Failed to post to TestRail: " + error.message, "danger");
  } finally {
    setPageBlockingOverlay(false);
  }
}

function openBlockedMoveDialog(blockedCases, movableCount) {
  return new Promise(function(resolve) {
    const overlay    = document.getElementById("blockedMoveOverlay");
    const list       = document.getElementById("blockedMoveList");
    const note       = document.getElementById("blockedMoveNote");
    const confirmBtn = document.getElementById("blockedMoveConfirmBtn");
    const cancelBtn  = document.getElementById("blockedMoveCancelBtn");

    list.innerHTML = blockedCases.map(tc =>
      `<li><i class="bi bi-cloud-check-fill" style="color:#0e7490;"></i><span><strong>${escapeHtml(tc.id || "")}</strong> — ${escapeHtml(tc.title || "")}</span></li>`
    ).join("");

    if (movableCount > 0) {
      note.textContent = `${movableCount} other test case(s) can still be moved.`;
      confirmBtn.style.display = "";
      confirmBtn.textContent = `Move remaining ${movableCount} test case(s)`;
      confirmBtn.innerHTML = `<i class="bi bi-folder-symlink me-1"></i>Move remaining ${movableCount} test case(s)`;
    } else {
      note.textContent = "No remaining test cases can be moved.";
      confirmBtn.style.display = "none";
    }

    overlay.classList.add("open");

    function cleanup() {
      overlay.classList.remove("open");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
    }
    function onConfirm()  { cleanup(); resolve(movableCount > 0); }
    function onCancel()   { cleanup(); resolve(false); }
    function onBackdrop(e){ if (e.target === overlay) onCancel(); }
    function onKeydown(e) { if (e.key === "Escape") onCancel(); }
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

async function handleBulkEditSection() {
  if (!selectedTcIds.size) return;

  // Separate posted (blocked) from movable test cases
  const selectedCases = getSelectedTestCases();
  const activePg = getActivePlatformGroup();
  const blockedCases  = selectedCases.filter(tc => {
    if (activePg) return hasPostedToTestrailFrontend(tc, activePg);
    return tc.testrailPost?.status === "success";
  });
  const movableCases  = selectedCases.filter(tc => !blockedCases.includes(tc));

  if (blockedCases.length > 0) {
    const proceed = await openBlockedMoveDialog(blockedCases, movableCases.length);
    if (!proceed) return;
    // Restrict the selection to only movable cases
    selectedTcIds.clear();
    movableCases.forEach(tc => selectedTcIds.add(tc.id));
    if (!selectedTcIds.size) return;
  }

  const dialogResult = await openBulkEditSectionDialog(getSectionOptions());
  if (!dialogResult) return;

  const ids = Array.from(selectedTcIds);

  if (dialogResult.mode === "per-platform" && dialogResult.perPlatformSelections) {
    // Per-platform mode: one bulk call per platform group
    let ok = 0, fail = 0;
    for (const pp of dialogResult.perPlatformSelections) {
      try {
        const res = await apiRequest("/testcase/bulkMoveSection", {
          method: "POST",
          body: JSON.stringify({
            promptId: currentScopePromptId,
            testcaseIds: ids,
            target: {
              sectionName: String(pp.selection.name || "").trim(),
              sectionId: pp.selection.sectionId ?? null,
              suiteId: pp.selection.suiteId ?? null,
              sectionSource: pp.selection.source || "ai",
            },
            platformGroup: pp.groupKey,
          }),
        });
        ok += res?.data?.moved || ids.length;
      } catch(e) { fail += ids.length; }
    }
    selectedTcIds.clear();
    await loadTestScope(currentScopePromptId);
    updateBulkBar();
    if (ok)   showBanner(ok + " test case(s) sections updated per platform.", "success");
    if (fail) showBanner(fail + " test case(s) failed to update.", "danger");
  } else {
    // Unified mode: single bulk call
    const newSelection = dialogResult.selection || dialogResult;
    const newSection = String(newSelection.name || "").trim();
    try {
      const res = await apiRequest("/testcase/bulkMoveSection", {
        method: "POST",
        body: JSON.stringify({
          promptId: currentScopePromptId,
          testcaseIds: ids,
          target: {
            sectionName: newSection,
            sectionId: newSelection.sectionId ?? null,
            suiteId: newSelection.suiteId ?? null,
            sectionSource: newSelection.source || "ai",
          },
          platformGroup: activePg || null,
        }),
      });
      const moved = res?.data?.moved || ids.length;
      selectedTcIds.clear();
      await loadTestScope(currentScopePromptId);
      updateBulkBar();
      showBanner(moved + ' test case(s) moved to "' + newSection + '".', "success");
    } catch(e) {
      selectedTcIds.clear();
      await loadTestScope(currentScopePromptId);
      updateBulkBar();
      showBanner("Failed to move test cases: " + (e.message || "Unknown error"), "danger");
    }
  }
}

async function handleBulkDelete() {
  if (!selectedTcIds.size) return;
  const confirmed = await openBulkDeleteConfirmDialog(selectedTcIds.size);
  if (!confirmed) return;
  const ids = Array.from(selectedTcIds);
  let ok = 0, fail = 0;
  for (const tcId of ids) {
    try {
      await apiRequest("/testcase/deleteTestCase/" + encodeURIComponent(currentScopePromptId) + "/" + encodeURIComponent(tcId), { method: "DELETE" });
      allTestCases = allTestCases.filter(t => t.id !== tcId);
      ok++;
    } catch(e) { fail++; }
  }
  selectedTcIds.clear();
  buildSectionsFromCases();
  renderSections();
  renderAllTestCases();
  updateBulkBar();
  if (ok)   showBanner(ok + " test case(s) deleted.", "success");
  if (fail) showBanner(fail + " test case(s) failed to delete.", "danger");
}

// --- SETTINGS CRUD: /settings ---
const refreshSettingsBtn = document.getElementById("refreshSettingsBtn");
const settingsRows = document.getElementById("settingsRows");
const addSettingRowBtn = document.getElementById("addSettingRowBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsTableBody = document.getElementById("settingsTableBody");
const modelCatalogAgentValue = document.getElementById("modelCatalogAgentValue");
const modelCatalogSearchInput = document.getElementById("modelCatalogSearchInput");
const modelCatalogStatus = document.getElementById("modelCatalogStatus");
const modelCatalogTableBody = document.getElementById("modelCatalogTableBody");
const modelCatalogSettingKey = document.getElementById("modelCatalogSettingKey");
const refreshModelCatalogBtn = document.getElementById("refreshModelCatalogBtn");

let availableSettingKeys = [];
let availableSettingKeyDefinitions = [];
const settingKeyConfidentialMap = new Map();
const SENSITIVE_SETTING_KEY_PATTERN = /(pass(word|wd)?|api[-_]?key|secret|token|credential|private[-_]?key|client[-_]?secret|access[-_]?key|auth(entication)?)/i;
const MODEL_AGENT_CONFIG = Object.freeze({
  copilot: { label: "Copilot", settingKey: "GITHUB_MODEL" },
  claude: { label: "Claude", settingKey: "CLAUDE_MODEL" },
  gemini: { label: "Gemini", settingKey: "GEMINI_MODEL" },
  litellm: { label: "LiteLLM", settingKey: "LITELLM_MODEL" },
});
const MODEL_AGENT_OPTIONS = Object.entries(MODEL_AGENT_CONFIG).map(([value, item]) => ({
  value,
  label: item.label,
  description: `${item.settingKey} target`,
}));

let currentSettingsMap = new Map();
let modelCatalogState = {
  agent: "copilot",
  settingKey: "GITHUB_MODEL",
  supported: false,
  models: [],
};

const modelCatalogAgentPicker = createStaticOptionSelect({
  wrapId: "modelCatalogAgentSelectWrap",
  triggerId: "modelCatalogAgentTrigger",
  triggerTextId: "modelCatalogAgentTriggerText",
  dropdownId: "modelCatalogAgentDropdown",
  searchId: "modelCatalogAgentSearch",
  optionsId: "modelCatalogAgentOptions",
  valueId: "modelCatalogAgentValue",
  options: MODEL_AGENT_OPTIONS,
});

function setSettingsStatus(message, variant = "muted") {
  if (!message || variant === "muted") return;
  showBanner(message, variant);
}

function setModelCatalogStatus(message, variant = "muted") {
  if (!modelCatalogStatus) return;
  modelCatalogStatus.textContent = message || "";
  modelCatalogStatus.classList.remove("text-muted", "text-danger", "text-success");
  modelCatalogStatus.classList.add(
    variant === "danger" ? "text-danger" : variant === "success" ? "text-success" : "text-muted"
  );
}

function isSensitiveSettingKey(key = "") {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return false;
  if (settingKeyConfidentialMap.has(normalizedKey)) {
    return Boolean(settingKeyConfidentialMap.get(normalizedKey));
  }
  return SENSITIVE_SETTING_KEY_PATTERN.test(normalizedKey);
}

function maskSettingValue(value = "") {
  return String(value || "") ? "••••••••" : "";
}

function updateSettingRowValueVisibility(row, { forceHidden = false } = {}) {
  const key = String(row.querySelector(".setting-key-value")?.value || "").trim();
  const valueInput = row.querySelector(".setting-value-input");
  const toggleBtn = row.querySelector(".setting-value-visibility-btn");
  const inputGroup = toggleBtn?.closest(".input-group");

  if (!valueInput || !toggleBtn) return;

  if (!isSensitiveSettingKey(key)) {
    valueInput.type = "text";
    toggleBtn.style.display = "none";
    toggleBtn.classList.remove("is-open");
    if (inputGroup) inputGroup.classList.remove("is-revealed");
    toggleBtn.dataset.visible = "1";
    toggleBtn.setAttribute("aria-label", "Show value");
    toggleBtn.setAttribute("title", "Show value");
    toggleBtn.innerHTML = '<i class="bi bi-eye"></i>';
    return;
  }

  toggleBtn.style.display = "";
  const shouldShow = forceHidden ? false : toggleBtn.dataset.visible === "1";
  valueInput.type = shouldShow ? "text" : "password";
  toggleBtn.dataset.visible = shouldShow ? "1" : "0";
  toggleBtn.classList.toggle("is-open", shouldShow);
  if (inputGroup) inputGroup.classList.toggle("is-revealed", shouldShow);
  toggleBtn.setAttribute("aria-label", shouldShow ? "Hide value" : "Show value");
  toggleBtn.setAttribute("title", shouldShow ? "Hide value" : "Show value");
  toggleBtn.innerHTML = `<i class="bi ${shouldShow ? "bi-eye-slash" : "bi-eye"}"></i>`;
}

function setSettingRowKey(row, key = "") {
  const hiddenInput = row.querySelector(".setting-key-value");
  const triggerText = row.querySelector(".setting-key-trigger .prompt-select-trigger-text");
  const normalizedKey = String(key || "").trim();

  hiddenInput.value = normalizedKey;
  triggerText.textContent = normalizedKey || "Select key...";
  triggerText.classList.toggle("is-placeholder", !normalizedKey);
  updateSettingRowValueVisibility(row, { forceHidden: true });
}

function renderSettingRowKeyOptions(row, filter = "") {
  const optionsEl = row.querySelector(".setting-key-options");
  const searchEl = row.querySelector(".setting-key-search");
  const currentValue = String(row.querySelector(".setting-key-value")?.value || "").trim();
  const query = String(filter || "").trim().toLowerCase();
  const defaultDefinitions = Array.isArray(availableSettingKeyDefinitions)
    ? availableSettingKeyDefinitions.filter((item) => item?.isAvailable !== false)
    : [];
  const hasCurrentInDefaults = defaultDefinitions.some((item) => String(item?.key || "").trim() === currentValue);
  const mergedDefinitions = currentValue && !hasCurrentInDefaults
    ? [{ key: currentValue, confidential: isSensitiveSettingKey(currentValue), isAvailable: false }, ...defaultDefinitions]
    : defaultDefinitions;
  const filteredDefinitions = mergedDefinitions.filter((item) => String(item?.key || "").toLowerCase().includes(query));

  optionsEl.innerHTML = "";

  if (!filteredDefinitions.length) {
    optionsEl.innerHTML = '<div class="prompt-select-no-results">No keys found.</div>';
    return;
  }

  filteredDefinitions.forEach((item) => {
    const key = String(item?.key || "").trim();
    if (!key) return;
    const isConfidential = Boolean(item?.confidential);
    const optionEl = document.createElement("div");
    optionEl.className = `prompt-select-option${currentValue === key ? " selected" : ""}`;
    optionEl.innerHTML = `
      <span class="prompt-select-option-id">${escapeHtml(key)}</span>
      <span class="prompt-select-option-name">${isConfidential ? "Confidential setting key" : "Standard setting key"}</span>
    `;
    optionEl.addEventListener("mousedown", (event) => {
      event.preventDefault();
      setSettingRowKey(row, key);
      searchEl.value = "";
      row.querySelector(".setting-key-dropdown")?.classList.remove("open");
      row.querySelector(".setting-key-trigger")?.classList.remove("open");
      renderSettingRowKeyOptions(row, "");
    });
    optionsEl.appendChild(optionEl);
  });
}

function appendSettingRow(key = "", value = "") {
  const row = document.createElement("div");
  row.className = "row g-2 align-items-center setting-row";
  row.innerHTML = `
    <div class="col-md-5 setting-key-picker">
      <div class="prompt-select-wrap">
        <div class="prompt-select-trigger setting-key-trigger" tabindex="0">
          <span class="prompt-select-trigger-text is-placeholder">Select key...</span>
          <i class="bi bi-chevron-down" style="font-size:0.75rem;flex-shrink:0;"></i>
        </div>
        <div class="prompt-select-dropdown setting-key-dropdown">
          <input type="text" class="prompt-select-search setting-key-search" placeholder="Search key..." autocomplete="off" />
          <div class="prompt-select-options setting-key-options"></div>
        </div>
      </div>
      <input type="hidden" class="setting-key-value" />
    </div>
    <div class="col-md-6">
      <div class="input-group input-group-sm">
        <input type="text" class="form-control form-control-sm setting-value-input" placeholder="Enter value" value="${escapeHtml(String(value || ""))}" />
        <button type="button" class="btn btn-outline-secondary setting-value-visibility-btn setting-eye-btn" aria-label="Show value" title="Show value" style="display:none;">
          <i class="bi bi-eye"></i>
        </button>
      </div>
    </div>
    <div class="col-md-1 text-end">
      <button type="button" class="btn btn-sm btn-outline-danger remove-setting-row" title="Remove row">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
  `;

  const triggerEl = row.querySelector(".setting-key-trigger");
  const dropdownEl = row.querySelector(".setting-key-dropdown");
  const searchEl = row.querySelector(".setting-key-search");
  const valueVisibilityBtn = row.querySelector(".setting-value-visibility-btn");

  setSettingRowKey(row, key);
  renderSettingRowKeyOptions(row);
  updateSettingRowValueVisibility(row, { forceHidden: true });

  valueVisibilityBtn.addEventListener("click", () => {
    const isCurrentlyVisible = valueVisibilityBtn.dataset.visible === "1";
    valueVisibilityBtn.dataset.visible = isCurrentlyVisible ? "0" : "1";
    updateSettingRowValueVisibility(row);
  });

  triggerEl.addEventListener("click", () => {
    const isOpen = dropdownEl.classList.contains("open");
    settingsRows.querySelectorAll(".setting-key-dropdown.open").forEach((el) => el.classList.remove("open"));
    settingsRows.querySelectorAll(".setting-key-trigger.open").forEach((el) => el.classList.remove("open"));

    if (isOpen) {
      dropdownEl.classList.remove("open");
      triggerEl.classList.remove("open");
      return;
    }

    dropdownEl.classList.add("open");
    triggerEl.classList.add("open");
    searchEl.focus();
    searchEl.select();
    renderSettingRowKeyOptions(row, searchEl.value);
  });

  triggerEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      triggerEl.click();
    }
  });

  searchEl.addEventListener("input", () => {
    renderSettingRowKeyOptions(row, searchEl.value);
  });

  searchEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      dropdownEl.classList.remove("open");
      triggerEl.classList.remove("open");
    }
  });

  row.querySelector(".remove-setting-row").addEventListener("click", () => {
    row.remove();
    if (!settingsRows.querySelector(".setting-row")) {
      appendSettingRow();
    }
  });

  settingsRows.appendChild(row);
}

function refreshSettingRowSelectOptions() {
  settingsRows.querySelectorAll(".setting-row").forEach((row) => {
    renderSettingRowKeyOptions(row, row.querySelector(".setting-key-search")?.value || "");
  });
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".setting-key-picker .prompt-select-wrap")) {
    return;
  }

  settingsRows.querySelectorAll(".setting-key-dropdown.open").forEach((el) => el.classList.remove("open"));
  settingsRows.querySelectorAll(".setting-key-trigger.open").forEach((el) => el.classList.remove("open"));
});

async function loadAvailableSettingKeys() {
  const resp = await apiRequest("/settings/key");
  const keys = resp?.data ?? resp;

  settingKeyConfidentialMap.clear();
  availableSettingKeyDefinitions = Array.isArray(keys)
    ? keys
        .map((entry) => {
          if (entry && typeof entry === "object" && !Array.isArray(entry)) {
            const key = String(entry.key || "").trim();
            if (!key) return null;
            const confidential = Boolean(entry.confidential);
            return {
              key,
              confidential,
              isAvailable: entry.isAvailable !== false,
            };
          }

          const key = String(entry || "").trim();
          if (!key) return null;
          return { key, confidential: SENSITIVE_SETTING_KEY_PATTERN.test(key), isAvailable: true };
        })
        .filter(Boolean)
    : [];

  availableSettingKeyDefinitions.forEach((item) => {
    settingKeyConfidentialMap.set(item.key, Boolean(item.confidential));
  });

  availableSettingKeys = availableSettingKeyDefinitions
    .filter((item) => item.isAvailable !== false)
    .map((item) => item.key);

  refreshSettingRowSelectOptions();
}

function renderSettingsTable(items = []) {
  const settings = Array.isArray(items) ? items : [];

  if (!settings.length) {
    settingsTableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center text-muted small">No settings found in .env.</td>
      </tr>`;
    return;
  }

  settingsTableBody.innerHTML = "";
  settings.forEach((item) => {
    const key = String(item?.key || "").trim();
    const value = String(item?.value || "");
    const isSensitive = isSensitiveSettingKey(key);
    const renderedValueCell = isSensitive
      ? `<div class="setting-secret-wrap">
          <code class="setting-value-text" data-visible="0" data-raw="${escapeHtml(value)}">${maskSettingValue(value)}</code>
        </div>`
      : `<code>${escapeHtml(value)}</code>`;

    const renderedEyeAction = isSensitive
      ? `<button type="button" class="btn btn-sm btn-outline-secondary me-1 setting-value-toggle-btn setting-eye-btn" data-visible="0" data-raw="${escapeHtml(value)}" aria-label="Show value" title="Show value">
          <i class="bi bi-eye"></i>
        </button>`
      : "";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><span class="badge bg-light text-dark border">${escapeHtml(key)}</span></td>
      <td>${renderedValueCell}</td>
      <td class="text-end">
        ${renderedEyeAction}
        <button class="btn btn-sm btn-outline-primary me-1 setting-edit-btn" data-key="${escapeHtml(key)}" data-value="${escapeHtml(value)}">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger setting-delete-btn" data-key="${escapeHtml(key)}">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    `;
    settingsTableBody.appendChild(row);
  });

  settingsTableBody.querySelectorAll(".setting-value-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest("tr");
      const wrap = row?.querySelector(".setting-secret-wrap");
      const valueTextEl = row?.querySelector(".setting-value-text");
      if (!valueTextEl) return;

      const rawValue = String(btn.dataset.raw || valueTextEl.dataset.raw || "");
      const nextVisible = btn.dataset.visible !== "1";

      btn.dataset.visible = nextVisible ? "1" : "0";
      btn.classList.toggle("is-open", nextVisible);
      if (wrap) wrap.classList.toggle("is-revealed", nextVisible);
      valueTextEl.dataset.visible = btn.dataset.visible;
      valueTextEl.textContent = nextVisible ? rawValue : maskSettingValue(rawValue);
      btn.setAttribute("aria-label", nextVisible ? "Hide value" : "Show value");
      btn.setAttribute("title", nextVisible ? "Hide value" : "Show value");
      btn.innerHTML = `<i class="bi ${nextVisible ? "bi-eye-slash" : "bi-eye"}"></i>`;
    });
  });

  settingsTableBody.querySelectorAll(".setting-edit-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.key || "";
      const currentValue = btn.dataset.value || "";
      const nextValue = await openSettingEditDialog(key, currentValue);

      if (nextValue == null) return;

      try {
        await apiRequest(`/settings/${encodeURIComponent(key)}`, {
          method: "PUT",
          body: JSON.stringify({ value: nextValue }),
        });
        setSettingsStatus(`Setting ${key} updated.`, "success");
        showBanner(`Setting ${key} updated successfully.`, "success");
        await loadSettingsPageData();
      } catch (error) {
        setSettingsStatus(`Update failed: ${error.message}`, "danger");
        showBanner(`Update failed: ${error.message}`, "danger");
      }
    });
  });

  settingsTableBody.querySelectorAll(".setting-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.key || "";
      const shouldDelete = await openSettingDeleteDialog(key);
      if (!shouldDelete) return;

      try {
        await apiRequest(`/settings/${encodeURIComponent(key)}`, {
          method: "DELETE",
        });
        setSettingsStatus(`Setting ${key} deleted.`, "success");
        showBanner(`Setting ${key} deleted successfully.`, "success");
        await loadSettingsPageData();
      } catch (error) {
        setSettingsStatus(`Delete failed: ${error.message}`, "danger");
        showBanner(`Delete failed: ${error.message}`, "danger");
      }
    });
  });
}

async function loadCurrentSettings() {
  const resp = await apiRequest("/settings");
  const list = resp?.data ?? resp;
  currentSettingsMap = new Map(
    (Array.isArray(list) ? list : []).map((item) => [String(item?.key || "").trim(), String(item?.value || "")])
  );
  renderSettingsTable(Array.isArray(list) ? list : []);
}

function formatTokenCount(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return "—";
  if (numberValue >= 1000000) return `${(numberValue / 1000000).toFixed(numberValue % 1000000 === 0 ? 0 : 1)}M`;
  if (numberValue >= 1000) return `${(numberValue / 1000).toFixed(numberValue % 1000 === 0 ? 0 : 1)}K`;
  return String(numberValue);
}

function getSelectedModelCatalogQuery() {
  return String(modelCatalogSearchInput?.value || "").trim().toLowerCase();
}

function renderModelCatalogTable() {
  if (!modelCatalogTableBody) return;

  const { models = [], supported = false, settingKey = "" } = modelCatalogState || {};
  if (modelCatalogSettingKey) {
    modelCatalogSettingKey.textContent = settingKey || "—";
  }

  if (!supported) {
    modelCatalogTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted small">Catalog is not available for this agent yet.</td></tr>`;
    return;
  }

  const query = getSelectedModelCatalogQuery();
  const filteredModels = models.filter((model) => {
    if (!query) return true;
    const haystack = [
      model.id,
      model.name,
      model.publisher,
      model.summary,
      ...(Array.isArray(model.tags) ? model.tags : []),
      ...(Array.isArray(model.capabilities) ? model.capabilities : []),
    ]
      .map((item) => String(item || "").toLowerCase())
      .join(" ");
    return haystack.includes(query);
  });

  if (!filteredModels.length) {
    modelCatalogTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted small">No models match the current filter.</td></tr>`;
    return;
  }

  const currentValue = String(currentSettingsMap.get(settingKey) || "").trim();
  modelCatalogTableBody.innerHTML = "";

  filteredModels.forEach((model) => {
    const isCurrent = currentValue && currentValue === String(model.id || "").trim();
    const capabilityBadges = (Array.isArray(model.capabilities) ? model.capabilities : [])
      .slice(0, 3)
      .map((capability) => `<span class="badge bg-light text-secondary border me-1 mb-1">${escapeHtml(capability)}</span>`)
      .join("");

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="fw-semibold d-flex align-items-center gap-2 flex-wrap">
          <span>${escapeHtml(model.name || model.id || "—")}</span>
          ${isCurrent ? '<span class="badge bg-success-subtle text-success border border-success-subtle">Current</span>' : ""}
        </div>
        <div class="small text-muted"><code>${escapeHtml(model.id || "—")}</code></div>
      </td>
      <td>
        <div>${escapeHtml(model.publisher || "—")}</div>
        <div class="small text-muted">${escapeHtml(model.rateLimitTier || "")}</div>
      </td>
      <td>
        <div class="small">${escapeHtml(model.summary || "No summary available.")}</div>
        ${model.htmlUrl ? `<div class="mt-1"><a href="${escapeHtml(model.htmlUrl)}" target="_blank" rel="noreferrer" class="small">Open details</a></div>` : ""}
      </td>
      <td><div class="small">${capabilityBadges || '<span class="text-muted">—</span>'}</div></td>
      <td>
        <div class="small fw-semibold">${formatTokenCount(model.maxInputTokens)}</div>
        <div class="small text-muted">input tokens</div>
      </td>
      <td class="text-end">
        <button type="button" class="btn btn-sm ${isCurrent ? "btn-outline-success" : "btn-outline-primary"} model-catalog-apply-btn" data-model-id="${escapeHtml(model.id || "")}">
          ${isCurrent ? '<i class="bi bi-check2-circle me-1"></i>Applied' : '<i class="bi bi-box-arrow-in-down-left me-1"></i>Use Model'}
        </button>
      </td>
    `;
    modelCatalogTableBody.appendChild(row);
  });

  modelCatalogTableBody.querySelectorAll(".model-catalog-apply-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const modelId = String(btn.dataset.modelId || "").trim();
      const targetSettingKey = String(modelCatalogState.settingKey || "").trim();
      if (!modelId || !targetSettingKey) return;

      const exists = currentSettingsMap.has(targetSettingKey);
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Applying';

      try {
        await apiRequest(exists ? `/settings/${encodeURIComponent(targetSettingKey)}` : "/settings", {
          method: exists ? "PUT" : "POST",
          body: JSON.stringify(exists ? { value: modelId } : { settings: [{ key: targetSettingKey, value: modelId }] }),
        });

        await loadSettingsPageData({ preserveCatalog: true });
        setModelCatalogStatus(`Applied ${modelId} to ${targetSettingKey}.`, "success");
        setSettingsStatus(`Setting ${targetSettingKey} updated from catalog.`, "success");
        showBanner(`Model ${modelId} applied to ${targetSettingKey}.`, "success");
      } catch (error) {
        setModelCatalogStatus(`Failed to apply model: ${error.message}`, "danger");
        showBanner(`Failed to apply model: ${error.message}`, "danger");
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });
  });
}

async function loadModelCatalog(agent = "copilot") {
  const normalizedAgent = String(agent || modelCatalogAgentPicker?.getValue() || modelCatalogAgentValue?.value || "copilot").trim().toLowerCase() || "copilot";
  const fallbackConfig = MODEL_AGENT_CONFIG[normalizedAgent] || MODEL_AGENT_CONFIG.copilot;

  modelCatalogState = {
    ...modelCatalogState,
    agent: normalizedAgent,
    settingKey: fallbackConfig.settingKey,
  };

  if (modelCatalogAgentValue) {
    modelCatalogAgentValue.value = normalizedAgent;
  }

  if (modelCatalogSettingKey) {
    modelCatalogSettingKey.textContent = fallbackConfig.settingKey;
  }

  setModelCatalogStatus(`Loading ${fallbackConfig.label} catalog...`);
  modelCatalogTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted small"><span class="spinner-border spinner-border-sm me-2" role="status"></span>Fetching model catalog...</td></tr>`;

  try {
    const resp = await apiRequest(`/settings/models?agent=${encodeURIComponent(normalizedAgent)}`);
    const data = resp?.data ?? resp ?? {};
    modelCatalogState = {
      agent: normalizedAgent,
      settingKey: String(data.settingKey || fallbackConfig.settingKey || "").trim(),
      supported: Boolean(data.supported),
      models: Array.isArray(data.models) ? data.models : [],
      message: String(data.message || "").trim(),
    };
    renderModelCatalogTable();
    setModelCatalogStatus(modelCatalogState.message || `Loaded ${modelCatalogState.models.length} model(s).`, modelCatalogState.supported ? "success" : "muted");
  } catch (error) {
    modelCatalogState = {
      agent: normalizedAgent,
      settingKey: fallbackConfig.settingKey,
      supported: false,
      models: [],
      message: "",
    };
    modelCatalogTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger small">Failed to load model catalog: ${escapeHtml(error.message)}</td></tr>`;
    setModelCatalogStatus(`Failed to load model catalog: ${error.message}`, "danger");
  }
}

function collectSettingRowsPayload() {
  const rows = Array.from(settingsRows.querySelectorAll(".setting-row"));
  const payload = [];

  rows.forEach((row) => {
    const key = String(row.querySelector(".setting-key-value")?.value || "").trim();
    const value = String(row.querySelector(".setting-value-input")?.value ?? "");
    if (!key) return;
    payload.push({ key, value });
  });

  return payload;
}

function findDuplicateSettingKeys(entries = []) {
  const seen = new Set();
  const duplicates = new Set();

  entries.forEach((entry) => {
    const key = String(entry?.key || "").trim();
    if (!key) return;

    if (seen.has(key)) {
      duplicates.add(key);
      return;
    }

    seen.add(key);
  });

  return Array.from(duplicates);
}

async function loadSettingsPageData({ preserveCatalog = false } = {}) {
  setSettingsStatus("Loading settings...");
  await loadAvailableSettingKeys();
  await loadCurrentSettings();

  if (!settingsRows.querySelector(".setting-row")) {
    appendSettingRow();
  }

  const selectedAgent = preserveCatalog
    ? String(modelCatalogState.agent || modelCatalogAgentPicker?.getValue() || modelCatalogAgentValue?.value || "copilot").trim().toLowerCase()
    : String(modelCatalogAgentPicker?.getValue() || modelCatalogAgentValue?.value || "copilot").trim().toLowerCase();
  await loadModelCatalog(selectedAgent || "copilot");

  setSettingsStatus("Settings loaded.");
}

addSettingRowBtn.addEventListener("click", () => appendSettingRow());

saveSettingsBtn.addEventListener("click", async () => {
  const settingsPayload = collectSettingRowsPayload();

  if (!settingsPayload.length) {
    setSettingsStatus("Please select at least one setting key to save.", "danger");
    return;
  }

  const duplicateKeys = findDuplicateSettingKeys(settingsPayload);
  if (duplicateKeys.length) {
    const duplicateMessage = `Duplicate key selected: ${duplicateKeys.join(", ")}`;
    setSettingsStatus(duplicateMessage, "danger");
    showBanner(duplicateMessage, "danger");
    return;
  }

  saveSettingsBtn.disabled = true;
  saveSettingsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Saving...';

  try {
    await apiRequest("/settings", {
      method: "POST",
      body: JSON.stringify({ settings: settingsPayload }),
    });

    settingsRows.innerHTML = "";
    appendSettingRow();

    await loadSettingsPageData();
    setSettingsStatus("Settings saved successfully.", "success");
    showBanner("Settings saved successfully.", "success");
  } catch (error) {
    setSettingsStatus(`Save failed: ${error.message}`, "danger");
    showBanner(`Save failed: ${error.message}`, "danger");
  } finally {
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.innerHTML = '<i class="bi bi-save me-1"></i>Save Settings';
  }
});

refreshSettingsBtn.addEventListener("click", () => {
  refreshSettingsBtn.classList.add("btn-spin");
  refreshSettingsBtn.disabled = true;
  loadSettingsPageData().finally(() => {
    setTimeout(() => {
      refreshSettingsBtn.classList.remove("btn-spin");
      refreshSettingsBtn.disabled = false;
    }, 600);
  });
});
modelCatalogAgentValue?.addEventListener("change", () => {
  loadModelCatalog(modelCatalogAgentPicker?.getValue() || modelCatalogAgentValue.value);
});
modelCatalogSearchInput?.addEventListener("input", () => {
  renderModelCatalogTable();
});
refreshModelCatalogBtn?.addEventListener("click", async () => {
  refreshModelCatalogBtn.classList.add("btn-spin");
  refreshModelCatalogBtn.disabled = true;
  await loadModelCatalog(modelCatalogAgentPicker?.getValue() || modelCatalogAgentValue?.value || modelCatalogState.agent || "copilot");
  setTimeout(() => {
    refreshModelCatalogBtn.classList.remove("btn-spin");
    refreshModelCatalogBtn.disabled = false;
  }, 500);
});
document.getElementById("settings-tab").addEventListener("shown.bs.tab", loadSettingsPageData);

// --- TESTRAIL SYNC CONFIG ---
let syncConfigData = { mappings: [], availablePlatformGroups: [] };
let syncConfigSuites = []; // cached suites for the modal

async function loadSyncConfig() {
  try {
    const response = await apiRequest("/testrail/syncconfig");
    syncConfigData = response?.data || { mappings: [], availablePlatformGroups: [] };
  } catch (error) {
    syncConfigData = { mappings: [], availablePlatformGroups: [] };
  }
  renderSyncConfigTable();
}

function renderSyncConfigTable() {
  const tbody = document.getElementById("syncConfigTableBody");
  if (!tbody) return;
  const mappings = syncConfigData.mappings || [];
  if (!mappings.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted small">No mappings configured.</td></tr>';
    return;
  }
  tbody.innerHTML = "";
  mappings.forEach(m => {
    const tr = document.createElement("tr");

    const tdGroup = document.createElement("td");
    const groupInfo = syncConfigData.availablePlatformGroups?.find(g => g.key === m.platformGroup);
    const label = groupInfo?.label || m.platformGroup;
    const platformList = groupInfo?.platforms?.join(", ") || "";
    tdGroup.innerHTML = `<span class="fw-semibold">${escapeHtml(label)}</span>${platformList ? `<br><span class="text-muted small">${escapeHtml(platformList)}</span>` : ""}`;
    tr.appendChild(tdGroup);

    const tdSuiteId = document.createElement("td");
    tdSuiteId.textContent = m.suiteId != null ? `S${m.suiteId}` : "—";
    tr.appendChild(tdSuiteId);

    const tdSuiteName = document.createElement("td");
    tdSuiteName.textContent = m.suiteName || "—";
    tr.appendChild(tdSuiteName);

    const tdUpdated = document.createElement("td");
    tdUpdated.textContent = m.updatedAt ? new Date(m.updatedAt).toLocaleString() : "—";
    tdUpdated.className = "text-muted small";
    tr.appendChild(tdUpdated);

    const tdActions = document.createElement("td");
    tdActions.className = "text-end";
    tdActions.innerHTML = `
      <button class="btn btn-sm btn-outline-primary icon-action-btn sync-config-edit-btn" title="Edit" data-platform-group="${escapeHtml(m.platformGroup)}">
        <i class="bi bi-pencil-square"></i>
      </button>
      <button class="btn btn-sm btn-outline-danger icon-action-btn sync-config-delete-btn" title="Remove" data-platform-group="${escapeHtml(m.platformGroup)}">
        <i class="bi bi-trash"></i>
      </button>
    `;
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });

  // Attach edit/delete handlers
  tbody.querySelectorAll(".sync-config-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openSyncConfigModal(btn.dataset.platformGroup));
  });
  tbody.querySelectorAll(".sync-config-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => openSyncConfigDeleteDialog(btn.dataset.platformGroup));
  });
}

async function loadSyncConfigSuites() {
  if (syncConfigSuites.length > 0) return syncConfigSuites;
  try {
    const response = await apiRequest("/testrail/getsuites");
    const payload = response?.data ?? response;
    syncConfigSuites = Array.isArray(payload?.suites) ? payload.suites : (Array.isArray(payload) ? payload : []);
  } catch (error) {
    syncConfigSuites = [];
  }
  return syncConfigSuites;
}

// --- Sync Config bloom dropdown helpers ---
function renderSyncConfigPlatformOptions(filter) {
  const optionsEl = document.getElementById("syncConfigPlatformOptions");
  if (!optionsEl) return;
  const q = (filter || "").toLowerCase();
  const allGroups = window._syncConfigModalGroups || [];
  optionsEl.innerHTML = "";
  allGroups.forEach(g => {
    const label = `${g.label} (${g.platforms.join(", ")})`;
    if (q && !label.toLowerCase().includes(q)) return;
    const optEl = document.createElement("div");
    optEl.className = "prompt-select-option";
    optEl.innerHTML = `<span class="prompt-select-option-id">${escapeHtml(g.label)}</span><span class="prompt-select-option-name">${escapeHtml(g.platforms.join(", "))}</span>`;
    optEl.dataset.value = g.key;
    optEl.addEventListener("click", () => {
      document.getElementById("syncConfigPlatformGroup").value = g.key;
      document.getElementById("syncConfigPlatformTriggerText").textContent = label;
      document.getElementById("syncConfigPlatformTriggerText").classList.remove("is-placeholder");
      document.getElementById("syncConfigPlatformDropdown").classList.remove("open");
      document.getElementById("syncConfigPlatformTrigger").classList.remove("open");
    });
    optionsEl.appendChild(optEl);
  });
  if (!optionsEl.children.length) {
    optionsEl.innerHTML = '<div class="text-muted small p-2">No platform groups available</div>';
  }
}

function renderSyncConfigSuiteOptions(filter) {
  const optionsEl = document.getElementById("syncConfigSuiteOptions");
  if (!optionsEl) return;
  const q = (filter || "").toLowerCase();
  const suites = window._syncConfigModalSuites || [];
  optionsEl.innerHTML = "";
  suites.forEach(s => {
    const label = `S${s.id} — ${s.name || "Untitled"}`;
    if (q && !label.toLowerCase().includes(q) && !String(s.id).includes(q)) return;
    const optEl = document.createElement("div");
    optEl.className = "prompt-select-option";
    optEl.innerHTML = `<span class="prompt-select-option-id">S${escapeHtml(String(s.id))}</span><span class="prompt-select-option-name">${escapeHtml(s.name || "Untitled")}</span>`;
    optEl.dataset.value = s.id;
    optEl.addEventListener("click", () => {
      document.getElementById("syncConfigSuiteSelect").value = String(s.id);
      document.getElementById("syncConfigSuiteTriggerText").textContent = label;
      document.getElementById("syncConfigSuiteTriggerText").classList.remove("is-placeholder");
      document.getElementById("syncConfigSuiteDropdown").classList.remove("open");
      document.getElementById("syncConfigSuiteTrigger").classList.remove("open");
    });
    optionsEl.appendChild(optEl);
  });
  if (!optionsEl.children.length) {
    const msg = suites.length === 0 ? "No suites available (check TestRail config)" : "No matching suites";
    optionsEl.innerHTML = `<div class="text-muted small p-2">${msg}</div>`;
  }
}

// Wire bloom dropdown toggle + search for both pickers (once, at load)
(function initSyncConfigDropdowns() {
  // Platform picker
  const pTrigger = document.getElementById("syncConfigPlatformTrigger");
  const pDropdown = document.getElementById("syncConfigPlatformDropdown");
  const pSearch = document.getElementById("syncConfigPlatformSearch");
  if (pTrigger && pDropdown) {
    pTrigger.addEventListener("click", () => {
      if (pTrigger.dataset.disabled === "true") return;
      const isOpen = pDropdown.classList.contains("open");
      pDropdown.classList.toggle("open", !isOpen);
      pTrigger.classList.toggle("open", !isOpen);
      if (!isOpen) { pSearch.value = ""; renderSyncConfigPlatformOptions(""); pSearch.focus(); }
    });
    pTrigger.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pTrigger.click(); } });
    pSearch.addEventListener("input", () => renderSyncConfigPlatformOptions(pSearch.value));
    pSearch.addEventListener("keydown", (e) => { if (e.key === "Escape") { pDropdown.classList.remove("open"); pTrigger.classList.remove("open"); } });
  }

  // Suite picker
  const sTrigger = document.getElementById("syncConfigSuiteTrigger");
  const sDropdown = document.getElementById("syncConfigSuiteDropdown");
  const sSearch = document.getElementById("syncConfigSuiteSearch");
  if (sTrigger && sDropdown) {
    sTrigger.addEventListener("click", () => {
      const isOpen = sDropdown.classList.contains("open");
      sDropdown.classList.toggle("open", !isOpen);
      sTrigger.classList.toggle("open", !isOpen);
      if (!isOpen) { sSearch.value = ""; renderSyncConfigSuiteOptions(""); sSearch.focus(); }
    });
    sTrigger.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sTrigger.click(); } });
    sSearch.addEventListener("input", () => renderSyncConfigSuiteOptions(sSearch.value));
    sSearch.addEventListener("keydown", (e) => { if (e.key === "Escape") { sDropdown.classList.remove("open"); sTrigger.classList.remove("open"); } });
  }
})();

// Close sync config dropdowns on outside click
document.addEventListener("click", (event) => {
  if (event.target.closest("#syncConfigPlatformWrap")) return;
  document.getElementById("syncConfigPlatformDropdown")?.classList.remove("open");
  document.getElementById("syncConfigPlatformTrigger")?.classList.remove("open");

  if (event.target.closest("#syncConfigSuiteWrap")) return;
  document.getElementById("syncConfigSuiteDropdown")?.classList.remove("open");
  document.getElementById("syncConfigSuiteTrigger")?.classList.remove("open");
});

async function openSyncConfigModal(editPlatformGroup) {
  const overlay = document.getElementById("syncConfigOverlay");
  const titleEl = document.getElementById("syncConfigTitle");
  const platformHidden = document.getElementById("syncConfigPlatformGroup");
  const suiteHidden = document.getElementById("syncConfigSuiteSelect");
  const form = document.getElementById("syncConfigForm");
  const pTrigger = document.getElementById("syncConfigPlatformTrigger");
  const pTriggerText = document.getElementById("syncConfigPlatformTriggerText");
  const sTriggerText = document.getElementById("syncConfigSuiteTriggerText");

  const isEdit = !!editPlatformGroup;
  titleEl.textContent = isEdit ? "Edit Platform Mapping" : "Add Platform Mapping";

  // Reset hidden values
  platformHidden.value = "";
  suiteHidden.value = "";

  // Close any open dropdowns
  document.getElementById("syncConfigPlatformDropdown")?.classList.remove("open");
  document.getElementById("syncConfigPlatformTrigger")?.classList.remove("open");
  document.getElementById("syncConfigSuiteDropdown")?.classList.remove("open");
  document.getElementById("syncConfigSuiteTrigger")?.classList.remove("open");

  // Populate platform group options
  const allGroups = syncConfigData.availablePlatformGroups || [];
  const existingGroups = new Set((syncConfigData.mappings || []).map(m => m.platformGroup));
  window._syncConfigModalGroups = allGroups.filter(g => {
    if (!isEdit && existingGroups.has(g.key)) return false;
    if (isEdit && g.key !== editPlatformGroup && existingGroups.has(g.key)) return false;
    return true;
  });

  if (isEdit) {
    const editGroup = allGroups.find(g => g.key === editPlatformGroup);
    platformHidden.value = editPlatformGroup;
    pTriggerText.textContent = editGroup ? `${editGroup.label} (${editGroup.platforms.join(", ")})` : editPlatformGroup;
    pTriggerText.classList.remove("is-placeholder");
    pTrigger.dataset.disabled = "true";
    pTrigger.style.opacity = "0.65";
    pTrigger.style.pointerEvents = "none";
  } else {
    pTriggerText.textContent = "Select platform group...";
    pTriggerText.classList.add("is-placeholder");
    pTrigger.dataset.disabled = "false";
    pTrigger.style.opacity = "";
    pTrigger.style.pointerEvents = "";
  }
  renderSyncConfigPlatformOptions("");

  // Reset suite picker
  sTriggerText.textContent = "Loading suites...";
  sTriggerText.classList.add("is-placeholder");

  // Show overlay immediately
  overlay.classList.add("open");

  // Load suites
  let suites = [];
  try {
    suites = await loadSyncConfigSuites();
  } catch (e) { /* TestRail may not be configured */ }
  window._syncConfigModalSuites = suites;

  if (!suites.length) {
    sTriggerText.textContent = "No suites available (check TestRail config)";
  } else {
    sTriggerText.textContent = "Select a suite...";
  }
  renderSyncConfigSuiteOptions("");

  // Pre-select suite if editing
  if (isEdit) {
    const existing = (syncConfigData.mappings || []).find(m => m.platformGroup === editPlatformGroup);
    if (existing?.suiteId) {
      suiteHidden.value = String(existing.suiteId);
      const suite = suites.find(s => String(s.id) === String(existing.suiteId));
      sTriggerText.textContent = suite ? `S${suite.id} — ${suite.name || "Untitled"}` : `S${existing.suiteId}`;
      sTriggerText.classList.remove("is-placeholder");
    }
  }

  // Handle form submission
  const onSubmit = async (e) => {
    e.preventDefault();
    const platformGroup = platformHidden.value;
    const suiteId = Number(suiteHidden.value);
    const suite = (window._syncConfigModalSuites || []).find(s => String(s.id) === String(suiteId));
    const suiteName = suite?.name || "";

    if (!platformGroup || !suiteId) {
      showBanner("Please select both a platform group and a suite.", "danger");
      return;
    }

    try {
      await apiRequest("/testrail/syncconfig", {
        method: "POST",
        body: JSON.stringify({ platformGroup, suiteId, suiteName }),
      });
      showBanner(`Mapping saved: ${platformGroup} → S${suiteId}`, "success");
      syncConfigSuites = []; // bust cache
      await loadSyncConfig();
    } catch (error) {
      showBanner("Failed to save mapping: " + error.message, "danger");
    }

    cleanup();
  };

  const onCancel = () => cleanup();
  const onBackdrop = (e) => { if (e.target === overlay) cleanup(); };
  const onKeydown = (e) => { if (e.key === "Escape") cleanup(); };

  function cleanup() {
    overlay.classList.remove("open");
    form.removeEventListener("submit", onSubmit);
    document.getElementById("syncConfigCancelBtn").removeEventListener("click", onCancel);
    overlay.removeEventListener("click", onBackdrop);
    document.removeEventListener("keydown", onKeydown);
    pTrigger.dataset.disabled = "false";
    pTrigger.style.opacity = "";
    pTrigger.style.pointerEvents = "";
  }

  form.addEventListener("submit", onSubmit);
  document.getElementById("syncConfigCancelBtn").addEventListener("click", onCancel);
  overlay.addEventListener("click", onBackdrop);
  document.addEventListener("keydown", onKeydown);
}

function openSyncConfigDeleteDialog(platformGroup) {
  const overlay = document.getElementById("syncConfigDeleteOverlay");
  const subEl = document.getElementById("syncConfigDeleteSub");
  const mapping = (syncConfigData.mappings || []).find(m => m.platformGroup === platformGroup);
  subEl.textContent = `Remove the mapping for "${mapping?.platformGroup || platformGroup}"${mapping?.suiteName ? ` (Suite: ${mapping.suiteName})` : ""}?`;

  overlay.classList.add("open");

  const confirmBtn = document.getElementById("syncConfigDeleteConfirmBtn");
  const cancelBtn = document.getElementById("syncConfigDeleteCancelBtn");

  const onConfirm = async () => {
    try {
      await apiRequest(`/testrail/syncconfig/${encodeURIComponent(platformGroup)}`, { method: "DELETE" });
      showBanner(`Mapping removed: ${platformGroup}`, "success");
      await loadSyncConfig();
    } catch (error) {
      showBanner("Failed to remove mapping: " + error.message, "danger");
    }
    cleanup();
  };

  const onCancel = () => cleanup();
  const onBackdrop = (e) => { if (e.target === overlay) cleanup(); };
  const onKeydown = (e) => { if (e.key === "Escape") cleanup(); };

  function cleanup() {
    overlay.classList.remove("open");
    confirmBtn.removeEventListener("click", onConfirm);
    cancelBtn.removeEventListener("click", onCancel);
    overlay.removeEventListener("click", onBackdrop);
    document.removeEventListener("keydown", onKeydown);
  }

  confirmBtn.addEventListener("click", onConfirm);
  cancelBtn.addEventListener("click", onCancel);
  overlay.addEventListener("click", onBackdrop);
  document.addEventListener("keydown", onKeydown);
}

document.getElementById("addSyncConfigBtn")?.addEventListener("click", () => openSyncConfigModal());
document.getElementById("refreshSyncConfigBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("refreshSyncConfigBtn");
  btn.classList.add("btn-spin");
  btn.disabled = true;
  syncConfigSuites = []; // bust cache
  await loadSyncConfig();
  setTimeout(() => { btn.classList.remove("btn-spin"); btn.disabled = false; }, 500);
});

// Load sync config when the TestRail Sync sub-tab is shown
document.getElementById("settings-testrail-sync-tab")?.addEventListener("shown.bs.tab", () => {
  loadSyncConfig();
});

// --- PROMPT DROPDOWN ---
let allPrompts = []; // [{promptId, projectName}]

function buildPromptDropdown(optionsEl, searchEl, triggerTextEl, triggerEl, dropdownEl, hiddenInput, onChange) {
  function renderOptions(filter) {
    const q = (filter || "").toLowerCase();
    const filtered = allPrompts.filter(p =>
      p.promptId.toLowerCase().includes(q) ||
      (p.projectName || "").toLowerCase().includes(q)
    );
    optionsEl.innerHTML = "";
    if (!filtered.length) {
      optionsEl.innerHTML = `<div class="prompt-select-no-results">No prompts found.</div>`;
      return;
    }
    filtered.forEach(p => {
      const div = document.createElement("div");
      div.className = "prompt-select-option" + (hiddenInput.value === p.promptId ? " selected" : "");
      div.innerHTML = `<span class="prompt-select-option-id">${p.promptId}</span>${p.projectName ? `<span class="prompt-select-option-name">${p.projectName}</span>` : ""}`;
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectPrompt(p);
      });
      optionsEl.appendChild(div);
    });
  }

  function selectPrompt(p) {
    hiddenInput.value = p.promptId;
    triggerTextEl.textContent = p.projectName ? `${p.promptId} — ${p.projectName}` : p.promptId;
    triggerTextEl.classList.remove("is-placeholder");
    closeDropdown();
    if (onChange) onChange(p.promptId);
  }

  function openDropdown() {
    dropdownEl.classList.add("open");
    triggerEl.classList.add("open");
    searchEl.value = "";
    renderOptions("");
    searchEl.focus();
  }

  function closeDropdown() {
    dropdownEl.classList.remove("open");
    triggerEl.classList.remove("open");
  }

  triggerEl.addEventListener("click", () => {
    dropdownEl.classList.contains("open") ? closeDropdown() : openDropdown();
  });

  triggerEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDropdown(); }
  });

  searchEl.addEventListener("input", () => renderOptions(searchEl.value));

  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDropdown();
  });

  document.addEventListener("click", (e) => {
    if (!triggerEl.contains(e.target) && !dropdownEl.contains(e.target)) closeDropdown();
  });

  return { renderOptions, selectPromptById: (id) => {
    const p = allPrompts.find(x => x.promptId === id);
    if (p) selectPrompt(p);
  }};
}

// Build dropdowns (will populate once prompts are loaded)
const analysisDropdown = buildPromptDropdown(
  document.getElementById("analysisPromptOptions"),
  document.getElementById("analysisPromptSearch"),
  document.getElementById("analysisPromptTriggerText"),
  document.getElementById("analysisPromptTrigger"),
  document.getElementById("analysisPromptDropdown"),
  document.getElementById("analysisPromptIdInput"),
  (id) => { doLoadAnalysis(id); }
);

const scopeDropdown = buildPromptDropdown(
  document.getElementById("scopePromptOptions"),
  document.getElementById("scopePromptSearch"),
  document.getElementById("scopePromptTriggerText"),
  document.getElementById("scopePromptTrigger"),
  document.getElementById("scopePromptDropdown"),
  document.getElementById("scopePromptIdInput"),
  (id) => { loadTestScope(id); }
);

async function loadAllPrompts() {
  try {
    const resp = await apiRequest("/dashboard/prompts");
    const list = resp?.data ?? resp;
    allPrompts = Array.isArray(list) ? list : [];
  } catch (e) {
    allPrompts = [];
  }
}

// Load prompts on startup and refresh dropdowns when tabs are shown
loadAllPrompts();
loadSyncConfig(); // Pre-load sync config for Move Section auto-suite selection
document.getElementById("test-analysis-tab").addEventListener("shown.bs.tab", loadAllPrompts);
document.getElementById("test-scope-tab").addEventListener("shown.bs.tab", loadAllPrompts);

// --- DASHBOARD ---
const dashRefreshBtn    = document.getElementById("dashRefreshBtn");
const dashStatus        = document.getElementById("dashStatus");
const dashTableBody     = document.getElementById("dashTableBody");
const dashStatTotal     = document.getElementById("dashStatTotal");
const dashStatCompleted = document.getElementById("dashStatCompleted");
const dashStatInProgress= document.getElementById("dashStatInProgress");
const dashStatAvgTime   = document.getElementById("dashStatAvgTime");
const dashStatTotalTc   = document.getElementById("dashStatTotalTc");
const failedPromptInfoModal = new bootstrap.Modal(document.getElementById("failedPromptInfoModal"));
const failedPromptIdText = document.getElementById("failedPromptIdText");
const failedPromptNoteText = document.getElementById("failedPromptNoteText");
const retryPromptOverlay = document.getElementById("retryPromptOverlay");
const retryPromptIdBadge = document.getElementById("retryPromptIdBadge");
const retryPromptCancelBtn = document.getElementById("retryPromptCancelBtn");
const retryPromptConfirmBtn = document.getElementById("retryPromptConfirmBtn");

function formatDashDate(str) {
  if (!str) return "—";
  try {
    return new Date(str).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch { return str; }
}

function formatDuration(ms) {
  if (ms == null || isNaN(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), rem = s % 60;
  return `${m}m ${rem}s`;
}

function getStatusBadge(status) {
  const map = {
    completed:   "bg-success",
    done:        "bg-success",
    processing:  "bg-warning text-dark",
    in_progress: "bg-warning text-dark",
    failed:      "bg-danger",
    error:       "bg-danger",
  };
  const key = String(status || "").toLowerCase().replace(/ /g, "_");
  const cls = map[key] || "bg-secondary";
  return `<span class="badge ${cls}">${status || "unknown"}</span>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openFailedPromptInfo(promptId, note) {
  failedPromptIdText.textContent = promptId || "—";
  failedPromptNoteText.textContent = String(note || "No failure details.");
  failedPromptInfoModal.show();
}

function openRetryPromptDialog(promptId) {
  return new Promise((resolve) => {
    if (!retryPromptOverlay) {
      resolve(confirm(`Retry prompt ${promptId}?`));
      return;
    }

    retryPromptIdBadge.textContent = promptId || "—";
    retryPromptOverlay.classList.add("open");

    const cleanup = () => {
      retryPromptOverlay.classList.remove("open");
      retryPromptConfirmBtn?.removeEventListener("click", onConfirm);
      retryPromptCancelBtn?.removeEventListener("click", onCancel);
      retryPromptOverlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
    };

    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onBackdrop = (event) => { if (event.target === retryPromptOverlay) onCancel(); };
    const onKeydown = (event) => { if (event.key === "Escape") onCancel(); };

    retryPromptConfirmBtn?.addEventListener("click", onConfirm);
    retryPromptCancelBtn?.addEventListener("click", onCancel);
    retryPromptOverlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

const promptLogModal = new bootstrap.Modal(document.getElementById("promptLogModal"));
const promptLogContent = document.getElementById("promptLogContent");
const promptLogModalSub = document.getElementById("promptLogModalSub");
const promptLogRefreshBtn = document.getElementById("promptLogRefreshBtn");

let _logAutoRefreshTimer = null;
let _logCurrentPromptId = null;

async function fetchAndRenderLog(promptId) {
  try {
    const resp = await apiRequest(`/dashboard/log/${encodeURIComponent(promptId)}`);
    const log = resp?.data?.log || "";
    if (!log) {
      promptLogContent.innerHTML = '<span style="color:#64748b;">No log entries found for this prompt.</span>';
      return;
    }
    // Preserve scroll position if user scrolled up
    const el = promptLogContent;
    const isAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 40;
    el.innerHTML = formatLogAsTerminal(log);
    if (isAtBottom) el.scrollTop = el.scrollHeight;
  } catch (err) {
    promptLogContent.innerHTML = `<span style="color:#f87171;">✗ Failed to load log: ${escapeHtml(err.message)}</span>`;
  }
}

async function openPromptLogModal(promptId) {
  _logCurrentPromptId = promptId;
  promptLogModalSub.textContent = promptId || "—";
  promptLogContent.innerHTML = '<span style="color:#94a3b8;">Loading...</span>';
  promptLogModal.show();

  await fetchAndRenderLog(promptId);

  // Start auto-refresh every 3s
  clearInterval(_logAutoRefreshTimer);
  _logAutoRefreshTimer = setInterval(() => {
    if (_logCurrentPromptId) fetchAndRenderLog(_logCurrentPromptId);
  }, 1500);
}

// Stop auto-refresh when modal closes
document.getElementById("promptLogModal").addEventListener("hidden.bs.modal", () => {
  clearInterval(_logAutoRefreshTimer);
  _logAutoRefreshTimer = null;
  _logCurrentPromptId = null;
});

// Manual refresh button
if (promptLogRefreshBtn) {
  promptLogRefreshBtn.addEventListener("click", () => {
    if (!_logCurrentPromptId) return;
    promptLogRefreshBtn.disabled = true;
    fetchAndRenderLog(_logCurrentPromptId).finally(() => {
      setTimeout(() => { promptLogRefreshBtn.disabled = false; }, 300);
    });
  });
}

function formatLogAsTerminal(raw) {
  const lines = String(raw).split("\n");
  return lines.map(line => {
    const escaped = escapeHtml(line);
    if (/\[FAIL\]/.test(line))    return `<span style="color:#f87171;">${escaped}</span>`;
    if (/\[WARN\]/.test(line))    return `<span style="color:#fbbf24;">${escaped}</span>`;
    if (/\[SUCCESS\]/.test(line)) return `<span style="color:#4ade80;">${escaped}</span>`;
    if (/\[START\]/.test(line))   return `<span style="color:#38bdf8;">${escaped}</span>`;
    if (/\[STEP\]/.test(line))    return `<span style="color:#a78bfa;">${escaped}</span>`;
    if (/\[INFO\]/.test(line))    return `<span style="color:#cbd5e1;">${escaped}</span>`;
    return `<span style="color:#94a3b8;">${escaped}</span>`;
  }).join("\n");
}

async function loadDashboard() {
  dashStatus.textContent = "Loading...";
  dashTableBody.innerHTML = `<tr><td colspan="8" class="dash-empty"><div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>Fetching data...</td></tr>`;

  try {
    const resp = await apiRequest("/dashboard");
    const data = resp?.data ?? resp;

    const prompts   = Array.isArray(data?.prompts) ? data.prompts :
                      Array.isArray(data)           ? data         : [];

    const total     = data?.totalPrompts    ?? prompts.length;
    const completed = data?.completed       ?? prompts.filter(p => /completed|done/i.test(p.status || "")).length;
    const inProg    = data?.inProgress      ?? prompts.filter(p => /processing|in_progress/i.test(p.status || "")).length;
    const avgMs     = data?.avgTurnaroundMs ?? null;
    const totalTc   = data?.totalTestCases  ?? prompts.reduce((acc, p) => acc + (p.testCaseCount ?? 0), 0);

    dashStatTotal.textContent       = total;
    dashStatCompleted.textContent   = completed;
    dashStatInProgress.textContent  = inProg;
    dashStatAvgTime.textContent     = avgMs != null ? formatDuration(avgMs) : "—";
    dashStatTotalTc.textContent     = totalTc || "—";

    if (!prompts.length) {
      dashTableBody.innerHTML = `<tr><td colspan="8" class="dash-empty">No prompts found.</td></tr>`;
      dashStatus.textContent = "Dashboard loaded.";
      return;
    }

    // Store prompts for filtering
    window._dashPrompts = prompts;
    renderDashTable(prompts);

    dashStatus.textContent = `Dashboard loaded · ${prompts.length} prompt(s).`;
  } catch (err) {
    dashTableBody.innerHTML = `<tr><td colspan="8" class="dash-empty text-danger">Failed to load dashboard: ${err.message}</td></tr>`;
    dashStatus.textContent = err.message;
  }
}

function renderDashTable(prompts) {
  // Apply filters
  const statusFilter = (document.getElementById("dashFilterStatus")?.value || "").toLowerCase();
  const projectFilter = (document.getElementById("dashFilterProject")?.value || "").toLowerCase().trim();
  const sortOrder = document.getElementById("dashSortOrder")?.value || "desc";

  let filtered = prompts.filter(p => {
    if (statusFilter && !String(p.status || "").toLowerCase().includes(statusFilter)) return false;
    if (projectFilter && !String(p.projectName || p.project || "").toLowerCase().includes(projectFilter)) return false;
    return true;
  });

  // Sort by created date
  filtered.sort((a, b) => {
    const da = new Date(a.createdAt || a.created_at || 0).getTime();
    const db = new Date(b.createdAt || b.created_at || 0).getTime();
    return sortOrder === "desc" ? db - da : da - db;
  });

  if (!filtered.length) {
    dashTableBody.innerHTML = `<tr><td colspan="8" class="dash-empty">No prompts match the current filters.</td></tr>`;
    return;
  }

  dashTableBody.innerHTML = "";
  filtered.forEach(p => {
      const promptId = p.promptId || p.id || "—";
      const project  = p.projectName || p.project || "—";
      const status   = p.status || "—";
      const model    = p.model || "—";
      const statusKey = String(status || "").toLowerCase().replace(/ /g, "_");
      const isFailed = statusKey === "failed" || statusKey === "error";
      const failureNote = String(p.failureNote || p.errorMessage || "").trim();
      const failureInfoButton = isFailed
        ? `<button class="btn btn-sm btn-outline-danger py-0 px-1 ms-1 dash-view-failure" data-id="${promptId}" data-note="${escapeHtml(failureNote || "No failure details")}" title="View Failure Details" style="font-size:0.75rem;"><i class="bi bi-info-circle"></i></button>`
        : "";
      const retryButton = isFailed
        ? `<button class="btn btn-sm btn-outline-warning py-0 px-1 ms-1 dash-retry" data-id="${promptId}" title="Retry" style="font-size:0.75rem;"><i class="bi bi-arrow-clockwise"></i></button>`
        : "";
      const tc       = p.testCaseCount ?? "—";
      const duration = p.turnaroundMs != null ? formatDuration(p.turnaroundMs) : "—";
      const created  = formatDashDate(p.createdAt || p.created_at);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="dash-prompt-link" data-promptid="${promptId}">${promptId}</span></td>
        <td>${project}</td>
        <td>${getStatusBadge(status)}</td>
        <td><span class="small text-muted">${escapeHtml(model)}</span></td>
        <td>${tc}</td>
        <td>${duration}</td>
        <td>${created}</td>
        <td class="text-start">
          <button class="btn btn-sm btn-outline-primary py-0 px-1 dash-view-analysis" data-id="${promptId}" title="View Analysis" style="font-size:0.75rem;"><i class="bi bi-bar-chart-line"></i></button>
          <button class="btn btn-sm btn-outline-secondary py-0 px-1 ms-1 dash-view-testcases" data-id="${promptId}" title="View Test Cases" style="font-size:0.75rem;"><i class="bi bi-list-check"></i></button>
          <button class="btn btn-sm btn-outline-dark py-0 px-1 ms-1 dash-view-log" data-id="${promptId}" title="View Processing Log" style="font-size:0.75rem;"><i class="bi bi-terminal"></i></button>
          ${failureInfoButton}
          ${retryButton}
        </td>`;
      dashTableBody.appendChild(tr);
  });

  dashTableBody.querySelectorAll(".dash-prompt-link, .dash-view-analysis").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.promptid || el.dataset.id;
      document.getElementById("analysisPromptIdInput").value = id;
      analysisDropdown.selectPromptById(id);
      document.getElementById("test-analysis-tab").click();
      doLoadAnalysis(id);
    });
  });

  dashTableBody.querySelectorAll(".dash-view-testcases").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      document.getElementById("scopePromptIdInput").value = id;
      scopeDropdown.selectPromptById(id);
      document.getElementById("test-scope-tab").click();
      loadTestScope(id);
    });
  });

  dashTableBody.querySelectorAll(".dash-view-failure").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      const note = el.dataset.note || "No failure details.";
      openFailedPromptInfo(id, note);
    });
  });

  dashTableBody.querySelectorAll(".dash-view-log").forEach(el => {
    el.addEventListener("click", () => {
      openPromptLogModal(el.dataset.id);
    });
  });

  dashTableBody.querySelectorAll(".dash-retry").forEach(el => {
    el.addEventListener("click", async () => {
      const id = el.dataset.id;
      const shouldRetry = await openRetryPromptDialog(id);
      if (!shouldRetry) return;
      el.disabled = true;
      el.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
      try {
        await apiRequest(`/generate/retry/${encodeURIComponent(id)}`, { method: "POST" });
        dashStatus.textContent = `Retry started for ${id}. Refresh dashboard to see progress.`;
        setTimeout(() => loadDashboard(), 3000);
      } catch (err) {
        alert(`Retry failed: ${err.message}`);
        el.disabled = false;
        el.innerHTML = `<i class="bi bi-arrow-clockwise"></i>`;
      }
    });
  });
}

// Dashboard filter dropdowns (using same createStaticOptionSelect pattern)
const DASH_STATUS_OPTIONS = [
  { value: "", label: "All Status", description: "" },
  { value: "completed", label: "Completed", description: "" },
  { value: "failed", label: "Failed", description: "" },
  { value: "processing", label: "Processing", description: "" },
  { value: "retrying", label: "Retrying", description: "" },
];

const DASH_SORT_OPTIONS = [
  { value: "desc", label: "Newest First", description: "" },
  { value: "asc", label: "Oldest First", description: "" },
];

const dashStatusPicker = createStaticOptionSelect({
  wrapId: "dashStatusSelectWrap",
  triggerId: "dashStatusTrigger",
  triggerTextId: "dashStatusTriggerText",
  dropdownId: "dashStatusDropdown",
  searchId: "dashStatusSearch",
  optionsId: "dashStatusOptions",
  valueId: "dashFilterStatus",
  options: DASH_STATUS_OPTIONS,
});

const dashSortPicker = createStaticOptionSelect({
  wrapId: "dashSortSelectWrap",
  triggerId: "dashSortTrigger",
  triggerTextId: "dashSortTriggerText",
  dropdownId: "dashSortDropdown",
  searchId: "dashSortSearch",
  optionsId: "dashSortOptions",
  valueId: "dashSortOrder",
  options: DASH_SORT_OPTIONS,
});

// Filter/sort event listeners — observe hidden input value changes via MutationObserver
const dashFilterStatusEl = document.getElementById("dashFilterStatus");
const dashSortOrderEl = document.getElementById("dashSortOrder");

new MutationObserver(() => { if (window._dashPrompts) renderDashTable(window._dashPrompts); })
  .observe(dashFilterStatusEl, { attributes: true, attributeFilter: ["value"] });
new MutationObserver(() => { if (window._dashPrompts) renderDashTable(window._dashPrompts); })
  .observe(dashSortOrderEl, { attributes: true, attributeFilter: ["value"] });

// Also poll value changes since hidden inputs don't fire "change"
let _lastDashStatusVal = "", _lastDashSortVal = "desc";
setInterval(() => {
  const sv = dashFilterStatusEl.value, so = dashSortOrderEl.value;
  if (sv !== _lastDashStatusVal || so !== _lastDashSortVal) {
    _lastDashStatusVal = sv; _lastDashSortVal = so;
    if (window._dashPrompts) renderDashTable(window._dashPrompts);
  }
}, 150);

document.getElementById("dashFilterProject")?.addEventListener("input", () => {
  if (window._dashPrompts) renderDashTable(window._dashPrompts);
});

dashRefreshBtn.addEventListener("click", () => {
  dashRefreshBtn.classList.add("btn-spin");
  dashRefreshBtn.disabled = true;
  loadDashboard().finally(() => {
    setTimeout(() => {
      dashRefreshBtn.classList.remove("btn-spin");
      dashRefreshBtn.disabled = false;
    }, 200);
  });
});
document.getElementById("dashboard-tab").addEventListener("shown.bs.tab", loadDashboard);
loadDashboard();

// --- Hash-based section/tab navigation ---
const hashToTab = {
  '#dashboard': 'dashboard-tab',
  '#form': 'form-tab',
  '#test-analysis': 'test-analysis-tab',
  '#testcases': 'test-scope-tab',
  '#test-scope': 'test-scope-tab',
  '#settings': 'settings-tab'
};
const tabToHash = {
  'dashboard-tab': '#dashboard',
  'form-tab': '#form',
  'test-analysis-tab': '#test-analysis',
  'test-scope-tab': '#testcases',
  'settings-tab': '#settings'
};

function activateTabFromHash() {
  const hash = window.location.hash.toLowerCase();
  const tabId = hashToTab[hash];
  if (tabId) {
    const tabEl = document.getElementById(tabId);
    if (tabEl) {
      const bsTab = new bootstrap.Tab(tabEl);
      bsTab.show();
    }
  }
}

// Update hash on tab change
document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tabEl => {
  tabEl.addEventListener('shown.bs.tab', () => {
    const h = tabToHash[tabEl.id];
    if (h) {
      history.replaceState(null, '', h);
    }
  });
});

// Activate tab on hashchange and initial load
window.addEventListener('hashchange', activateTabFromHash);
if (window.location.hash) {
  activateTabFromHash();
}

// Initialize Bootstrap tooltips
document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
  new bootstrap.Tooltip(el);
});
