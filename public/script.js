
window.uiReady = new Promise((resolve) => {
  window.__resolveUIReady = resolve;
});

const $ = (sel) => document.querySelector(sel);

const els = {
  appTitle: $("#appTitle"),
  appSubtitle: $("#appSubtitle"),

  baseUrl: $("#baseUrl"),
  finalUrl: $("#finalUrl"),

  formMount: $("#formMount"),

  copyBtn: $("#copyBtn"),

  widgetUrl: $("#widgetUrlInput"),
  copyBtn: $("#btnWidgetUrl"),
  statusPill: $("#statusPill"),
  countPill: $("#countPill"),
  sectionsMount: document.querySelector(".left"),
};

let schema = null;
let state = {};

// Estado auth compartido con auth.js
window.authState = window.authState || {
  isAuthorized: false,
  refreshToken: null
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const res = await fetch("./config/config.json", { cache: "no-store" });
  schema = await res.json();

  // App info
  els.appTitle.textContent = schema.app?.title ?? "Configuración";
  els.appSubtitle.textContent = schema.app?.subtitle ?? "";

  // Base URL
  els.baseUrl.placeholder =
    schema.base?.baseUrlPlaceholder ?? "URL base…";
  els.baseUrl.value =
    schema.base?.defaultBaseUrl ?? "";

  setDefaultState();
  renderSections();
  buildUrl();

  // Listeners
  els.copyBtn.addEventListener("click", copyUrl);

  els.baseUrl.addEventListener("input", () => {
    buildUrl();
  });

  window.__resolveUIReady();
  console.log("[ui] UI lista");

}

// --------------------------
// Estado inicial
// --------------------------
function setDefaultState() {
    state = state || {};

    for (const section of schema.sections) {
        for (const field of section.fields) {

        if (state[field.id] !== undefined && state[field.id] !== "") {
            continue;
        }
        state[field.id] = field.default ?? "";
        }
    }
}


// --------------------------
// Render de secciones
// --------------------------
function renderSections() {
  // eliminar cards dinámicas previas
  els.sectionsMount
    .querySelectorAll(".card.dynamic")
    .forEach((c) => c.remove());

  for (const section of schema.sections) {
    const card = document.createElement("div");
    card.className = "card dynamic";

    card.innerHTML = `
      <div class="cardHeader">
        <h2 class="cardTitle">${section.title}</h2>
        <p class="cardHint">${section.description ?? ""}</p>
      </div>
    `;

    const body = document.createElement("div");
    body.className = "sectionBody";

    section.fields.forEach((field) => {
      body.appendChild(renderField(field));
    });

    card.appendChild(body);
    els.sectionsMount.appendChild(card);
  }
}

function renderField(field) {
  const wrap = document.createElement("div");
  wrap.className = "field";

  const label = document.createElement("div");
  label.className = "fieldLabel";

  const labelText = document.createElement("span");
  labelText.textContent = field.label;

  const meta = document.createElement("span");
  meta.className = "fieldMeta";
  meta.textContent = field.param;

  label.append(labelText, meta);
  wrap.appendChild(label);

  const row = document.createElement("div");
  row.className = "row";

  let input;

  // SWITCH
  if (field.type === "switch") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!state[field.id];

    const line = document.createElement("label");
    line.className = "switchLine";
    line.appendChild(input);

    const txt = document.createElement("span");
    txt.textContent = input.checked ? "Activado" : "Desactivado";
    line.appendChild(txt);

    input.addEventListener("change", () => {
      state[field.id] = input.checked;
      txt.textContent = input.checked ? "Activado" : "Desactivado";
      buildUrl();
    });

    row.appendChild(line);
    wrap.appendChild(row);
    return wrap;
  }

  if (field.description) {
    const desc = document.createElement("div");
    desc.className = "fieldDesc";
    desc.textContent = field.description;
    wrap.appendChild(desc);
  }

  // NUMBER / TEXT
  input = document.createElement("input");
  input.className = "input";
  if(field.type === "number"){
    input.type = "number";
  }else if(field.type === "password"){
    input.type = "password";
  }else{
    input.type = "text";
  }
  input.value = state[field.id];

  if (field.min !== undefined) input.min = field.min;
  if (field.max !== undefined) input.max = field.max;
  if (field.step !== undefined) input.step = field.step;
  if (field.placeholder) input.placeholder = field.placeholder;

  input.addEventListener("input", () => {
    state[field.id] =
      field.type === "number" ? Number(input.value) : input.value;
    buildUrl();
  });

  wrap.appendChild(input);
  return wrap;
}

function copyUrl() {
  const val = (els.widgetUrl?.value || "").trim();
  if (!val) return;

  navigator.clipboard.writeText(val).then(() => {
    if (els.statusPill) {
      els.statusPill.textContent = "Copiado ✅";
      els.statusPill.style.background = "rgba(169,112,255,0.18)";
      els.statusPill.style.borderColor = "rgba(169,112,255,0.26)";
      setTimeout(() => buildUrl(), 900);
    }
  });
}

function toggleCopyButton() {
  const copyCard = document.getElementById("copyUrl");
  if (!copyCard) return;

  copyCard.style.display = window.authState.isAuthorized
    ? "block"
    : "none";
}

function normalizeBaseUrl(url) {
    return (url || "").trim();
}

function toQueryValue(field, value) {
    // Boolean switches -> "true"/"false"
    if (field.type === "switch") return value ? "true" : "false";
    // Everything else -> string
    return String(value ?? "");
}

function buildUrl() {
  const baseUrl = normalizeBaseUrl(schema?.base?.defaultBaseUrl);

  if (!baseUrl) {
    if (els.widgetUrl) els.widgetUrl.value = "";
    if (els.statusPill) {
      els.statusPill.textContent = "Falta URL base";
      els.statusPill.style.background = "rgba(255, 77, 77, 0.16)";
      els.statusPill.style.borderColor = "rgba(255, 77, 77, 0.22)";
    }
    if (els.countPill) els.countPill.textContent = "0 parametros";
    return "";
  }

  const url = new URL(baseUrl, window.location.href);

  let count = 0;
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const v = state[field.id];
      url.searchParams.set(field.param, toQueryValue(field, v));
      count++;
    }
  }

  els.widgetUrl.value = url.toString();

  if (els.statusPill) {
    els.statusPill.textContent = "Listo";
    els.statusPill.style.background = "rgba(0, 255, 136, 0.14)";
    els.statusPill.style.borderColor = "rgba(0, 255, 136, 0.20)";
  }
  if (els.countPill) els.countPill.textContent = `${count} parametros`;

  return url.toString();
}

async function init() {
  const res = await fetch("./config/config.json", { cache: "no-store" });
  schema = await res.json();
  console.debug("Schema: ", schema);
  
  setDefaultState();
  renderSections();
  buildUrl();

  els.copyBtn.addEventListener("click", copyUrl);
}

document.addEventListener("DOMContentLoaded", init);
