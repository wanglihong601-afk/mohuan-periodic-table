const elements = window.ELEMENTS || [];

const categoryColors = {
  "碱金属": "#ffbc42",
  "碱土金属": "#ff7a45",
  "过渡金属": "#58c7d8",
  "贫金属": "#64a7df",
  "类金属": "#f4db4c",
  "非金属": "#d9e84f",
  "稀有气体": "#b262bb",
  "镧系元素": "#79c943",
  "锕系元素": "#1cb7ab",
  "未知元素": "#d6d4d4"
};

const phaseZh = {
  Solid: "固态",
  Liquid: "液态",
  Gas: "气态"
};

const categoryFilter = document.querySelector("#categoryFilter");
const phaseFilter = document.querySelector("#phaseFilter");
const elementSearch = document.querySelector("#elementSearch");
const elementList = document.querySelector("#elementList");
const encyclopediaGrid = document.querySelector("#encyclopediaGrid");
const resultCount = document.querySelector("#resultCount");
const hotspotLayer = document.querySelector("#hotspotLayer");
const mapViewport = document.querySelector("#mapViewport");
const mapStage = document.querySelector("#mapStage");
const dialog = document.querySelector("#elementDialog");
const dialogContent = document.querySelector("#dialogContent");
const dialogClose = document.querySelector("#dialogClose");
const themeToggle = document.querySelector("#themeToggle");

const state = {
  scale: 0.78,
  x: 0,
  y: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  activeNumber: null,
  lastAutoFocusQuery: ""
};

const hotspotMap = new Map();

function formatValue(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "资料待补充";
  if (typeof value === "number") return `${Math.round(value * 1000) / 1000}${suffix}`;
  return `${value}${suffix}`;
}

function compactText(text, max = 92) {
  if (!text) return "资料待补充";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function shellsLabel(el) {
  return Array.isArray(el.shells) && el.shells.length ? el.shells.join(" / ") : "资料待补充";
}

function blockLabel(block) {
  return block ? `${block.toUpperCase()} 区` : "资料待补充";
}

function mainlandSourceUrl(el) {
  return `https://baike.baidu.com/item/${encodeURIComponent(el.zh)}`;
}

function tileColor(el) {
  return categoryColors[el.categoryZh] || "#58c7d8";
}

function elementMatches(el, query) {
  if (!query) return true;
  const raw = query.trim();
  const q = raw.toLowerCase();
  if (/^\d+$/.test(raw)) return String(el.number) === raw;
  if (/^[a-z]{1,2}$/i.test(raw)) return el.symbol.toLowerCase() === q;
  return [
    el.number,
    el.symbol,
    el.name,
    el.zh
  ].some((value) => String(value || "").toLowerCase().includes(q));
}

function visibleElements() {
  const query = elementSearch.value;
  const category = categoryFilter.value;
  const phase = phaseFilter.value;
  return elements.filter((el) => {
    const categoryOk = category === "all" || el.categoryZh === category;
    const phaseOk = phase === "all" || el.phase === phase;
    return categoryOk && phaseOk && elementMatches(el, query);
  });
}

function setupFilters() {
  const categories = [...new Set(elements.map((el) => el.categoryZh))];
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.append(option);
  }
}

function renderLists() {
  const visible = visibleElements();
  const query = elementSearch.value.trim();
  resultCount.textContent = `${visible.length} 个元素`;
  elementList.innerHTML = "";
  encyclopediaGrid.innerHTML = "";

  for (const el of visible) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `element-row${state.activeNumber === el.number ? " active" : ""}`;
    row.style.setProperty("--tile-color", tileColor(el));
    row.innerHTML = `
      <span class="row-symbol">${el.symbol}</span>
      <span class="row-name"><strong>${el.zh} · ${el.name}</strong><small>${el.categoryZh} / ${phaseZh[el.phase] || el.phase}</small></span>
      <span class="row-number">${el.number}</span>
    `;
    row.addEventListener("click", () => selectElement(el, true));
    elementList.append(row);

    const card = document.createElement("article");
    card.className = "element-card";
    card.style.setProperty("--tile-color", tileColor(el));
    card.innerHTML = `
      <img src="${el.image}" alt="${el.zh}的卡通图" loading="lazy" />
      <div class="element-card-body">
        <h3>${el.number}. ${el.zh} ${el.symbol}</h3>
        <p>${el.categoryZh} · ${phaseZh[el.phase] || el.phase} · ${blockLabel(el.block)}</p>
        <div class="mini-facts">
          <span>周期 ${el.period}</span>
          <span>族 ${el.group || "无"}</span>
          <span>原子量 ${formatValue(el.atomic_mass)}</span>
          <span>密度 ${formatValue(el.density)}</span>
        </div>
        <p class="summary-text">${compactText(kidSummary(el), 74)}</p>
      </div>
    `;
    card.addEventListener("click", () => selectElement(el, true, true));
    encyclopediaGrid.append(card);
  }

  updateHotspots(visible);
  if (query && visible.length === 1 && state.lastAutoFocusQuery !== query) {
    state.lastAutoFocusQuery = query;
    state.activeNumber = visible[0].number;
    focusElement(visible[0]);
    updateHotspots(visible);
  }
  if (!query) state.lastAutoFocusQuery = "";
}

function hotspotPosition(el) {
  const xPositions = [101, 169, 236, 304, 371, 439, 506, 574, 641, 709, 776, 844, 911, 979, 1046, 1114, 1181, 1249];
  const yPositions = [288, 386, 484, 582, 680, 778, 876];
  const main = {
    x: xPositions[el.xpos - 1],
    y: yPositions[el.ypos - 1]
  };

  if (el.number >= 57 && el.number <= 71) {
    return { x: xPositions[2 + (el.number - 57)], y: 974 };
  }
  if (el.number >= 89 && el.number <= 103) {
    return { x: xPositions[2 + (el.number - 89)], y: 1072 };
  }
  return main;
}

function createHotspots() {
  for (const el of elements) {
    const pos = hotspotPosition(el);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hotspot";
    button.style.left = `${pos.x}px`;
    button.style.top = `${pos.y}px`;
    button.dataset.symbol = el.symbol;
    button.dataset.number = String(el.number);
    button.title = `${el.zh} ${el.symbol}`;
    button.setAttribute("aria-label", `查看${el.zh}`);
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", () => selectElement(el, false, true));
    hotspotLayer.append(button);
    hotspotMap.set(el.number, button);
  }
}

function updateHotspots(visible) {
  const visibleSet = new Set(visible.map((el) => el.number));
  const hasActiveFilter = Boolean(elementSearch.value.trim()) || categoryFilter.value !== "all" || phaseFilter.value !== "all";
  for (const [number, node] of hotspotMap) {
    node.classList.toggle("match", hasActiveFilter && visibleSet.has(number));
    node.classList.toggle("selected", number === state.activeNumber);
  }
}

function applyTransform() {
  mapStage.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

function clampScale(next) {
  return Math.max(0.42, Math.min(2.2, next));
}

function resetView() {
  const rect = mapViewport.getBoundingClientRect();
  state.scale = Math.min(rect.width / 1417, rect.height / 1299) * 0.98;
  state.x = (rect.width - 1417 * state.scale) / 2;
  state.y = (rect.height - 1299 * state.scale) / 2;
  applyTransform();
}

function zoomAt(delta, originX, originY) {
  const nextScale = clampScale(state.scale + delta);
  const ratio = nextScale / state.scale;
  state.x = originX - (originX - state.x) * ratio;
  state.y = originY - (originY - state.y) * ratio;
  state.scale = nextScale;
  applyTransform();
}

function focusElement(el) {
  const pos = hotspotPosition(el);
  const rect = mapViewport.getBoundingClientRect();
  state.scale = Math.max(state.scale, 1.05);
  state.x = rect.width / 2 - (pos.x + 31) * state.scale;
  state.y = rect.height / 2 - (pos.y + 46) * state.scale;
  applyTransform();
}

function selectElement(el, focus = true, open = false) {
  state.activeNumber = el.number;
  if (focus) focusElement(el);
  renderLists();
  if (open) showDialog(el);
}

function showDialog(el) {
  const source = `<a class="source-link" href="${mainlandSourceUrl(el)}" target="_blank" rel="noreferrer">百度百科资料</a>`;
  dialogContent.innerHTML = `
    <div class="dialog-body" style="--tile-color: ${tileColor(el)}">
      <div class="dialog-media">
        <div class="big-symbol">
          <strong>${el.symbol}</strong>
          <span>${el.number}<br>${el.zh}</span>
        </div>
        <img src="${el.image}" alt="${el.zh}的卡通图" />
        ${source}
      </div>
      <div class="dialog-copy">
        <p class="eyebrow">${el.categoryZh} · ${phaseZh[el.phase] || el.phase}</p>
        <h3>${el.zh} ${el.name}</h3>
        <p class="dialog-summary">${kidSummary(el)}</p>
        <p class="dialog-summary">${el.summary || "英文百科摘要待补充。"}</p>
        <div class="facts">
          <div class="fact"><span>原子序数</span><strong>${el.number}</strong></div>
          <div class="fact"><span>元素符号</span><strong>${el.symbol}</strong></div>
          <div class="fact"><span>中文名 / 英文名</span><strong>${el.zh} / ${el.name}</strong></div>
          <div class="fact"><span>元素分类</span><strong>${el.categoryZh}</strong></div>
          <div class="fact"><span>常温状态</span><strong>${phaseZh[el.phase] || el.phase}</strong></div>
          <div class="fact"><span>周期 / 族</span><strong>${el.period} / ${el.group || "无"}</strong></div>
          <div class="fact"><span>元素区块</span><strong>${blockLabel(el.block)}</strong></div>
          <div class="fact"><span>相对原子质量</span><strong>${formatValue(el.atomic_mass)}</strong></div>
          <div class="fact"><span>外观</span><strong>${formatValue(el.appearance)}</strong></div>
          <div class="fact"><span>密度</span><strong>${formatValue(el.density, " g/L 或 g/cm³")}</strong></div>
          <div class="fact"><span>熔点</span><strong>${formatValue(el.melt, " K")}</strong></div>
          <div class="fact"><span>沸点</span><strong>${formatValue(el.boil, " K")}</strong></div>
          <div class="fact"><span>电负性</span><strong>${formatValue(el.electronegativity)}</strong></div>
          <div class="fact"><span>第一电离能</span><strong>${formatValue(el.ionization, " kJ/mol")}</strong></div>
          <div class="fact"><span>电子亲和能</span><strong>${formatValue(el.electron_affinity, " kJ/mol")}</strong></div>
          <div class="fact"><span>摩尔热容</span><strong>${formatValue(el.molar_heat, " J/mol·K")}</strong></div>
          <div class="fact"><span>电子层排布</span><strong>${shellsLabel(el)}</strong></div>
          <div class="fact wide"><span>电子排布</span><strong>${el.electron_configuration || "资料待补充"}</strong></div>
          <div class="fact"><span>发现者</span><strong>${el.discovered_by}</strong></div>
          <div class="fact"><span>命名者</span><strong>${formatValue(el.named_by)}</strong></div>
        </div>
      </div>
    </div>
  `;
  dialog.showModal();
}

function kidSummary(el) {
  const phase = phaseZh[el.phase] || el.phase;
  const use = {
    H: "它像最轻的小火箭燃料，是宇宙里数量非常多的元素。",
    O: "它是呼吸和燃烧的重要伙伴，也是水分子里的明星成员。",
    C: "它像生命世界的积木，钻石、铅笔芯和身体里的有机物都离不开它。",
    Fe: "它是钢铁和磁铁故事里的主角，也藏在血红蛋白里帮忙运输氧气。",
    Au: "它闪闪发光、不容易生锈，常被做成首饰和精密电子材料。",
    U: "它能释放巨大的原子能量，所以需要非常专业和安全地研究。"
  };
  const base = use[el.symbol] || `${el.zh}属于${el.categoryZh}，在常温下通常是${phase}。`;
  return `${base} 记住它的魔法代号是 ${el.symbol}，原子序数是 ${el.number}。`;
}

function setupMapControls() {
  document.querySelector("#zoomOut").addEventListener("click", () => {
    const rect = mapViewport.getBoundingClientRect();
    zoomAt(-0.16, rect.width / 2, rect.height / 2);
  });
  document.querySelector("#zoomIn").addEventListener("click", () => {
    const rect = mapViewport.getBoundingClientRect();
    zoomAt(0.16, rect.width / 2, rect.height / 2);
  });
  document.querySelector("#zoomReset").addEventListener("click", resetView);

  mapViewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = mapViewport.getBoundingClientRect();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    zoomAt(delta, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  mapViewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".hotspot")) return;
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    mapViewport.classList.add("dragging");
    mapViewport.setPointerCapture(event.pointerId);
  });

  mapViewport.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    state.x += event.clientX - state.lastX;
    state.y += event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    applyTransform();
  });

  mapViewport.addEventListener("pointerup", (event) => {
    state.dragging = false;
    mapViewport.classList.remove("dragging");
    mapViewport.releasePointerCapture(event.pointerId);
  });

  window.addEventListener("resize", resetView);
}

function renderSolubilityTable() {
  const cations = ["H⁺", "NH₄⁺", "Na⁺", "K⁺", "Ag⁺", "Ba²⁺", "Ca²⁺", "Cu²⁺", "Fe³⁺"];
  const anions = ["OH⁻", "NO₃⁻", "Cl⁻", "SO₄²⁻", "CO₃²⁻", "PO₄³⁻", "S²⁻", "Br⁻", "I⁻"];
  const rules = {
    "NO₃⁻": "soluble",
    "Na⁺": "soluble",
    "K⁺": "soluble",
    "NH₄⁺": "soluble",
    "Ag⁺|Cl⁻": "insoluble",
    "Ag⁺|Br⁻": "slight",
    "Ag⁺|I⁻": "insoluble",
    "Ba²⁺|SO₄²⁻": "insoluble",
    "Ca²⁺|SO₄²⁻": "slight",
    "H⁺|CO₃²⁻": "react",
    "H⁺|S²⁻": "react"
  };
  const label = { soluble: "溶", slight: "微", insoluble: "不", react: "反应" };
  const table = document.querySelector("#solubilityTable");
  table.innerHTML = `<div class="sol-cell sol-head">离子</div>${anions.map((a) => `<div class="sol-cell sol-head">${a}</div>`).join("")}`;
  for (const cation of cations) {
    table.insertAdjacentHTML("beforeend", `<div class="sol-cell sol-head">${cation}</div>`);
    for (const anion of anions) {
      const key = `${cation}|${anion}`;
      const status = rules[key] || rules[cation] || rules[anion] || (["CO₃²⁻", "PO₄³⁻", "S²⁻", "OH⁻"].includes(anion) ? "insoluble" : "soluble");
      table.insertAdjacentHTML("beforeend", `<div class="sol-cell cell-${status}" title="${cation} + ${anion}">${label[status]}</div>`);
    }
  }
}

function setupWizard() {
  const form = document.querySelector("#wizardForm");
  const input = document.querySelector("#wizardInput");
  const log = document.querySelector("#wizardLog");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    appendMessage(question, "user");
    input.value = "";
    const el = elements.find((item) => elementMatches(item, question));
    appendMessage(answerQuestion(question, el), "assistant");
    if (el) selectElement(el, true);
  });

  function appendMessage(text, type) {
    const div = document.createElement("div");
    div.className = `message ${type}`;
    div.textContent = text;
    log.append(div);
    log.scrollTop = log.scrollHeight;
  }
}

function answerQuestion(question, el) {
  if (!el) {
    return "我还没有在本地元素档案里找到对应元素。你可以试试输入中文名、英文名、元素符号或原子序数。";
  }
  if (/熔点|沸点|温度/.test(question)) {
    return `${el.zh}的熔点约为 ${formatValue(el.melt, " K")}，沸点约为 ${formatValue(el.boil, " K")}。`;
  }
  if (/密度|重/.test(question)) {
    return `${el.zh}的密度资料是 ${formatValue(el.density, " g/L 或 g/cm³")}。同一单位下数值越大，通常越“沉”。`;
  }
  if (/状态|固体|液体|气体/.test(question)) {
    return `${el.zh}在常温下通常是${phaseZh[el.phase] || el.phase}，属于${el.categoryZh}。`;
  }
  return kidSummary(el);
}

function setupTheme() {
  const stored = localStorage.getItem("magic-periodic-theme");
  if (stored === "dark") document.body.classList.add("dark");
  themeToggle.textContent = document.body.classList.contains("dark") ? "☀" : "☾";
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    themeToggle.textContent = isDark ? "☀" : "☾";
    localStorage.setItem("magic-periodic-theme", isDark ? "dark" : "light");
  });
}

function init() {
  setupTheme();
  setupFilters();
  createHotspots();
  renderLists();
  renderSolubilityTable();
  setupWizard();
  setupMapControls();
  resetView();

  elementSearch.addEventListener("input", renderLists);
  categoryFilter.addEventListener("change", renderLists);
  phaseFilter.addEventListener("change", renderLists);
  dialogClose.addEventListener("click", () => dialog.close());

  const first = elements.find((el) => el.number === 1);
  if (first) selectElement(first, false);
}

init();
