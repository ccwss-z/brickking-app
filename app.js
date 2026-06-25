const ROWS = 14;
const COLS = 10;
const CELL_COUNT = ROWS * COLS;
const DEFAULT_THRESHOLD = 0.42;
const ANALYSIS_FEATURE_INSET = 0.07;
const MODEL_DISTANCE_THRESHOLD = 0.18;
const MAX_SAME_TILE_COUNT = 4;
const VALID_TILE_COUNTS = new Set([2, 4]);
const MATCH_CANDIDATE_LIMIT = 8;
const WEAK_MATCH_DISTANCE = 0.34;
const WEAK_QUARTET_DISTANCE_GAP = 0.045;
const COLOR_MISMATCH_DISTANCE = 0.50;
const DEFAULT_CATEGORY_ID = "00000000-0000-0000-0000-000000000001";
const ATLAS_STORAGE_KEY = "brickking-pwa-atlas-v2";
const ATLAS_PAGE_SIZE = 20;

const state = {
  image: null,
  sourceDataURL: "",
  grid: null,
  board: Array(CELL_COUNT).fill(0),
  confidence: Array(CELL_COUNT).fill(0),
  atlas: [],
  categories: [{ id: DEFAULT_CATEGORY_ID, name: "默认" }],
  selectedCategoryID: DEFAULT_CATEGORY_ID,
  recognitionCategoryID: "all",
  atlasPage: 0,
  selectingTiles: false,
  selectedTileIDs: new Set(),
  importDrafts: [],
  importPreview: null,
  importCutPreview: null,
  activeTileID: null,
  steps: [],
  stepIndex: 0,
  stepBoards: [],
  autoTimer: null,
  autoPaused: false,
  canvasMode: "screenshot",
  embeddingModel: null,
  embeddingModelPromise: null,
  embeddingModelFailed: false,
  debugCellResults: []
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const els = {
  imageInput: $("#imageInput"),
  atlasInput: $("#atlasInput"),
  previewCanvas: $("#previewCanvas"),
  sourceImage: $("#sourceImage"),
  emptyPreview: $("#emptyPreview"),
  emptyCutPreview: $("#emptyCutPreview"),
  correctionBoard: $("#correctionBoard"),
  stepBoard: $("#stepBoard"),
  statusText: $("#statusText"),
  warningMessage: $("#warningMessage"),
  recognizeButton: $("#recognizeButton"),
  solveButton: $("#solveButton"),
  uploadButtonText: $("#uploadButtonText"),
  savePreviewButton: $("#savePreviewButton"),
  stepTitle: $("#stepTitle"),
  stepDescription: $("#stepDescription"),
  stepCounter: $("#stepCounter"),
  resultTitle: $("#resultTitle"),
  resultSubtitle: $("#resultSubtitle"),
  resultReason: $("#resultReason"),
  instructionIcon: $("#instructionIcon"),
  prevStep: $("#prevStep"),
  nextStep: $("#nextStep"),
  backToCorrection: $("#backToCorrection"),
  atlasGrid: $("#atlasGrid"),
  atlasCount: $("#atlasCount"),
  atlasCountInline: $("#atlasCountInline"),
  atlasSubtitle: $("#atlasSubtitle"),
  atlasMessage: $("#atlasMessage"),
  categoryStrip: $("#categoryStrip"),
  atlasEmptyState: $("#atlasEmptyState"),
  atlasPrevPage: $("#atlasPrevPage"),
  atlasNextPage: $("#atlasNextPage"),
  atlasPageIndicator: $("#atlasPageIndicator"),
  multiSelectButton: $("#multiSelectButton"),
  deleteSelectedButton: $("#deleteSelectedButton"),
  addCategoryButton: $("#addCategoryButton"),
  deleteCategoryButton: $("#deleteCategoryButton"),
  atlasScreenshotInput: $("#atlasScreenshotInput"),
  tileCountBadge: $("#tileCountBadge"),
  atlasCategorySelect: $("#atlasCategorySelect"),
  uploadComputerButton: $("#uploadComputerButton"),
  autoNextToggle: $("#autoNextToggle"),
  autoNextSeconds: $("#autoNextSeconds"),
  autoNextPauseButton: $("#autoNextPauseButton"),
  clearData: $("#clearData"),
  openAtlas: $("#openAtlas"),
  backHome: $("#backHome"),
  appChrome: $("#appChrome"),
  homeScreen: $("#homeScreen"),
  atlasScreen: $("#atlasScreen"),
  workCanvas: $("#workCanvas"),
  resultCanvas: $("#resultCanvas"),
  normalControls: $("#normalControls"),
  stepControls: $("#stepControls"),
  categoryModal: $("#categoryModal"),
  categoryNameInput: $("#categoryNameInput"),
  cancelCategoryButton: $("#cancelCategoryButton"),
  confirmCategoryButton: $("#confirmCategoryButton"),
  importReviewModal: $("#importReviewModal"),
  importPreviewSection: $("#importPreviewSection"),
  importPreviewCanvas: $("#importPreviewCanvas"),
  saveImportPreviewButton: $("#saveImportPreviewButton"),
  importCutSection: $("#importCutSection"),
  importCutCanvas: $("#importCutCanvas"),
  selectAllDraftsButton: $("#selectAllDraftsButton"),
  draftList: $("#draftList"),
  cancelImportButton: $("#cancelImportButton"),
  saveImportButton: $("#saveImportButton"),
  tileMenuModal: $("#tileMenuModal"),
  tileMenuTitle: $("#tileMenuTitle"),
  renameTileButton: $("#renameTileButton"),
  moveTileCategorySelect: $("#moveTileCategorySelect"),
  deleteTileButton: $("#deleteTileButton"),
  closeTileMenuButton: $("#closeTileMenuButton")
};

init();

async function init() {
  bindEvents();
  await loadAtlas();
  renderAtlas();
  renderBoard(els.correctionBoard, state.board);
  renderStep();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function bindEvents() {
  $$(".canvas-tab").forEach(button => {
    button.addEventListener("click", () => setCanvasMode(button.dataset.canvas));
  });

  els.imageInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadScreenshot(file);
  });

  if (els.recognizeButton) {
    els.recognizeButton.addEventListener("click", async () => {
      if (!state.image) return;
      await recognizeCurrentImage();
      setCanvasMode("correction");
    });
  }

  els.solveButton.addEventListener("click", () => {
    solveCurrentBoard();
  });

  els.prevStep.addEventListener("click", () => {
    state.stepIndex = Math.max(0, state.stepIndex - 1);
    renderStep();
  });

  els.nextStep.addEventListener("click", () => {
    advanceStep();
  });

  els.backToCorrection.addEventListener("click", () => {
    showResult(false);
    setCanvasMode("correction");
  });

  els.openAtlas.addEventListener("click", () => showScreen("atlas"));
  els.backHome.addEventListener("click", () => showScreen("home"));

  els.savePreviewButton.addEventListener("click", () => {
    if (!state.image || !state.grid) return;
    const anchor = document.createElement("a");
    anchor.download = "砖王切割预览.png";
    anchor.href = els.previewCanvas.toDataURL("image/png");
    anchor.click();
  });

  els.atlasInput.addEventListener("change", async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await prepareDirectTileImports(files);
  });

  els.atlasScreenshotInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await prepareScreenshotTileImports(file);
  });

  els.autoNextToggle.addEventListener("change", syncAutoNext);
  els.autoNextSeconds.addEventListener("change", syncAutoNext);
  els.autoNextPauseButton.addEventListener("click", () => {
    state.autoPaused = !state.autoPaused;
    els.autoNextPauseButton.textContent = state.autoPaused ? "继续" : "暂停";
    syncAutoNext();
  });

  els.clearData.addEventListener("click", () => {
    if (!confirm("确定清空砖块图鉴吗？")) return;
    state.atlas = [];
    state.categories = [{ id: DEFAULT_CATEGORY_ID, name: "默认" }];
    state.selectedCategoryID = DEFAULT_CATEGORY_ID;
    state.recognitionCategoryID = "all";
    state.atlasPage = 0;
    persistAtlas();
    renderAtlas();
    if (state.image) recognizeCurrentImage();
  });

  els.atlasPrevPage.addEventListener("click", () => {
    state.atlasPage = Math.max(0, state.atlasPage - 1);
    renderAtlas();
  });

  els.atlasNextPage.addEventListener("click", () => {
    state.atlasPage = Math.min(totalAtlasPages() - 1, state.atlasPage + 1);
    renderAtlas();
  });

  els.multiSelectButton.addEventListener("click", () => {
    state.selectingTiles = !state.selectingTiles;
    state.selectedTileIDs.clear();
    renderAtlas();
  });

  els.deleteSelectedButton.addEventListener("click", () => {
    const count = state.selectedTileIDs.size;
    if (!count || !confirm(`确定删除 ${count} 个砖块吗？`)) return;
    state.atlas = state.atlas.filter(entry => !state.selectedTileIDs.has(entry.uuid));
    state.selectedTileIDs.clear();
    state.selectingTiles = false;
    normalizeAtlasNumericIDs();
    clampAtlasPage();
    persistAtlas();
    renderAtlas();
    setAtlasMessage(`已删除 ${count} 个砖块`);
    if (state.image) recognizeCurrentImage();
  });

  els.addCategoryButton.addEventListener("click", () => {
    els.categoryNameInput.value = "";
    openModal(els.categoryModal);
    setTimeout(() => els.categoryNameInput.focus(), 30);
  });

  els.cancelCategoryButton.addEventListener("click", () => closeModal(els.categoryModal));
  els.confirmCategoryButton.addEventListener("click", addCategoryFromModal);
  els.categoryNameInput.addEventListener("keydown", event => {
    if (event.key === "Enter") addCategoryFromModal();
  });

  els.deleteCategoryButton.addEventListener("click", () => {
    if (state.selectedCategoryID === DEFAULT_CATEGORY_ID) {
      setAtlasMessage("默认分类无法删除");
      return;
    }
    const category = state.categories.find(item => item.id === state.selectedCategoryID);
    if (!category || !confirm(`确定删除分类「${category.name}」吗？分类中的砖块会移到默认。`)) return;
    state.categories = state.categories.filter(item => item.id !== category.id);
    for (const entry of state.atlas) {
      if (entry.categoryID === category.id) entry.categoryID = DEFAULT_CATEGORY_ID;
    }
    state.selectedCategoryID = DEFAULT_CATEGORY_ID;
    state.recognitionCategoryID = state.recognitionCategoryID === category.id ? "all" : state.recognitionCategoryID;
    persistAtlas();
    renderAtlas();
    if (state.image) recognizeCurrentImage();
  });

  els.cancelImportButton.addEventListener("click", () => closeModal(els.importReviewModal));
  els.saveImportButton.addEventListener("click", saveImportDrafts);
  els.selectAllDraftsButton.addEventListener("click", () => {
    const allSelected = state.importDrafts.length > 0 && state.importDrafts.every(draft => draft.selected);
    state.importDrafts.forEach(draft => draft.selected = !allSelected);
    renderImportDrafts();
  });
  els.saveImportPreviewButton.addEventListener("click", () => {
    if (!state.importPreview) return;
    downloadCanvas(els.importPreviewCanvas, "砖王图鉴分割预览.png");
  });

  els.closeTileMenuButton.addEventListener("click", () => closeModal(els.tileMenuModal));
  els.renameTileButton.addEventListener("click", renameActiveTile);
  els.moveTileCategorySelect.addEventListener("change", moveActiveTile);
  els.deleteTileButton.addEventListener("click", deleteActiveTile);

  els.atlasCategorySelect.addEventListener("change", () => {
    state.recognitionCategoryID = els.atlasCategorySelect.value;
    if (state.image) recognizeCurrentImage();
  });
}

function showScreen(name) {
  els.homeScreen.classList.toggle("active", name === "home");
  els.atlasScreen.classList.toggle("active", name === "atlas");
  els.appChrome.hidden = name === "atlas";
}

function setCanvasMode(name) {
  const tab = $(`.canvas-tab[data-canvas="${name}"]`);
  if (tab?.disabled) return;
  state.canvasMode = name;
  $$(".canvas-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.canvas === name));
  $$(".canvas-pane").forEach(panel => panel.classList.toggle("active", panel.id === `canvas-${name}`));
}

function setCanvasEnabled(name, enabled) {
  const tab = $(`.canvas-tab[data-canvas="${name}"]`);
  if (tab) tab.disabled = !enabled;
}

function showResult(visible) {
  els.workCanvas.hidden = visible;
  els.resultCanvas.hidden = !visible;
  els.normalControls.hidden = visible;
  els.stepControls.hidden = !visible;
}

async function loadAtlas() {
  setStatus("加载图鉴", "正在读取本地图鉴。");
  const saved = JSON.parse(localStorage.getItem(ATLAS_STORAGE_KEY) || "null");
  const categories = saved?.categories?.length ? saved.categories : [{ id: DEFAULT_CATEGORY_ID, name: "默认" }];
  state.categories = categories.some(item => item.id === DEFAULT_CATEGORY_ID)
    ? categories
    : [{ id: DEFAULT_CATEGORY_ID, name: "默认" }, ...categories];
  state.selectedCategoryID = saved?.selectedCategoryID || DEFAULT_CATEGORY_ID;
  state.recognitionCategoryID = saved?.recognitionCategoryID || "all";
  const entries = saved?.entries || [];
  const loadedEntries = await Promise.all(entries.map((entry, index) => atlasEntryFromData(entry, index + 1, true)));
  state.atlas = loadedEntries.filter(Boolean);
  normalizeAtlasNumericIDs();
  setStatus("图鉴已就绪", state.atlas.length ? `已加载 ${state.atlas.length} 个砖块模板。` : "图鉴为空，请先导入砖块。");
}

async function atlasEntryFromData(entry, fallbackId, userAdded) {
  const imageData = entry.imageData?.startsWith("data:")
    ? entry.imageData
    : `data:image/png;base64,${entry.imageData}`;
  const image = await loadImage(imageData).catch(() => null);
  if (!image) return null;
  const feature = featureFromImage(image);
  return {
    id: fallbackId,
    uuid: entry.id || crypto.randomUUID(),
    name: entry.name || `砖块 ${fallbackId}`,
    categoryID: entry.categoryID || DEFAULT_CATEGORY_ID,
    imageData,
    image,
    feature,
    pixelFeature: pixelFeatureFromImage(image),
    iconFeature: iconFeatureFromImage(image),
    colorFeature: colorFeatureFromImage(image),
    userAdded
  };
}

async function addAtlasImage(file) {
  const imageData = await readFileAsDataURL(file);
  const image = await loadImage(imageData);
  return {
    id: nextAtlasNumericID(),
    uuid: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, "") || nextAvailableAtlasName("砖块"),
    categoryID: state.selectedCategoryID,
    imageData,
    image,
    feature: featureFromImage(image),
    pixelFeature: pixelFeatureFromImage(image),
    iconFeature: iconFeatureFromImage(image),
    colorFeature: colorFeatureFromImage(image),
    userAdded: true
  };
}

function persistAtlas() {
  const entries = state.atlas
    .map(entry => ({
      id: entry.uuid,
      name: entry.name,
      categoryID: entry.categoryID || DEFAULT_CATEGORY_ID,
      imageData: entry.imageData
    }));
  try {
    localStorage.setItem(ATLAS_STORAGE_KEY, JSON.stringify({
      categories: state.categories,
      selectedCategoryID: state.selectedCategoryID,
      recognitionCategoryID: state.recognitionCategoryID,
      entries
    }));
  } catch {
    alert("浏览器本地空间不够，部分图鉴可能无法保存。");
  }
}

function nextAtlasNumericID(extraEntries = []) {
  const ids = [...state.atlas, ...extraEntries].map(entry => Number(entry.id) || 0);
  return Math.max(0, ...ids) + 1;
}

function normalizeAtlasNumericIDs() {
  const seen = new Set();
  let next = 1;
  for (const entry of state.atlas) {
    const id = Number(entry.id);
    if (id > 0 && !seen.has(id)) {
      entry.id = id;
      seen.add(id);
      next = Math.max(next, id + 1);
    } else {
      while (seen.has(next)) next++;
      entry.id = next;
      seen.add(next);
      next++;
    }
  }
}

function renderAtlas() {
  els.atlasCount.textContent = state.atlas.length;
  if (els.atlasCountInline) els.atlasCountInline.textContent = `${state.atlas.length} 个`;
  renderCategoryOptions();
  renderRecognitionCategoryOptions();

  const category = currentCategory();
  const entries = currentCategoryEntries();
  clampAtlasPage();
  const pages = totalAtlasPages();
  const pageEntries = entries.slice(state.atlasPage * ATLAS_PAGE_SIZE, state.atlasPage * ATLAS_PAGE_SIZE + ATLAS_PAGE_SIZE);
  els.atlasSubtitle.textContent = `${category.name} · ${entries.length} 个砖块`;
  els.atlasPageIndicator.textContent = `${Math.min(state.atlasPage + 1, pages)} / ${pages}`;
  els.atlasPrevPage.disabled = state.atlasPage <= 0;
  els.atlasNextPage.disabled = state.atlasPage >= pages - 1;
  els.multiSelectButton.innerHTML = state.selectingTiles ? "<span>✓</span>完成" : "<span>☑</span>多选";
  els.multiSelectButton.setAttribute("aria-label", state.selectingTiles ? "完成选择" : "多选删除");
  els.multiSelectButton.title = state.selectingTiles ? "完成选择" : "多选删除";
  els.deleteSelectedButton.hidden = !state.selectingTiles;
  els.deleteSelectedButton.textContent = `删除 ${state.selectedTileIDs.size} 个`;
  els.deleteSelectedButton.disabled = state.selectedTileIDs.size === 0;
  els.deleteCategoryButton.disabled = state.selectedCategoryID === DEFAULT_CATEGORY_ID;

  els.atlasGrid.innerHTML = "";
  els.atlasEmptyState.hidden = state.atlas.length > 0 && entries.length > 0;
  els.atlasGrid.hidden = !els.atlasEmptyState.hidden;
  if (!state.atlas.length) {
    els.atlasEmptyState.querySelector("strong").textContent = "暂无砖块";
    els.atlasEmptyState.querySelector("span").textContent = "先导入砖块图片或使用截图分割。";
  } else if (!entries.length) {
    els.atlasEmptyState.querySelector("strong").textContent = "当前分类暂无砖块";
    els.atlasEmptyState.querySelector("span").textContent = "导入砖块会加入当前分类。";
  }

  for (const entry of pageEntries) {
    const item = document.createElement("button");
    item.className = "atlas-item";
    item.type = "button";
    item.classList.toggle("selected", state.selectedTileIDs.has(entry.uuid));
    item.innerHTML = `
      <div class="atlas-thumb">
        <img alt="" src="${entry.imageData}">
        ${state.selectingTiles ? `<span class="atlas-check">${state.selectedTileIDs.has(entry.uuid) ? "✓" : ""}</span>` : ""}
      </div>
      <span class="atlas-name">${escapeHtml(entry.name)}</span>
    `;
    item.addEventListener("click", () => {
      if (state.selectingTiles) {
        if (state.selectedTileIDs.has(entry.uuid)) state.selectedTileIDs.delete(entry.uuid);
        else state.selectedTileIDs.add(entry.uuid);
        renderAtlas();
      } else {
        openTileMenu(entry.uuid);
      }
    });
    els.atlasGrid.appendChild(item);
  }

  for (let i = pageEntries.length; i < ATLAS_PAGE_SIZE; i++) {
    const blank = document.createElement("div");
    blank.className = "atlas-item";
    blank.innerHTML = `<div class="atlas-thumb" style="opacity:.35"></div><span class="atlas-name">&nbsp;</span>`;
    els.atlasGrid.appendChild(blank);
  }
}

function renderCategoryOptions() {
  els.categoryStrip.innerHTML = "";
  for (const category of state.categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-button";
    button.classList.toggle("active", category.id === state.selectedCategoryID);
    button.textContent = category.name;
    button.addEventListener("click", () => {
      state.selectedCategoryID = category.id;
      state.atlasPage = 0;
      state.selectingTiles = false;
      state.selectedTileIDs.clear();
      persistAtlas();
      renderAtlas();
    });
    els.categoryStrip.appendChild(button);
  }
}

function renderRecognitionCategoryOptions() {
  els.atlasCategorySelect.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "全部图鉴";
  els.atlasCategorySelect.appendChild(all);
  for (const category of state.categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    els.atlasCategorySelect.appendChild(option);
  }
  els.atlasCategorySelect.value = state.recognitionCategoryID || "all";
}

function currentCategory() {
  return state.categories.find(item => item.id === state.selectedCategoryID) || state.categories[0];
}

function currentCategoryEntries() {
  return state.atlas.filter(entry => (entry.categoryID || DEFAULT_CATEGORY_ID) === state.selectedCategoryID);
}

function recognitionAtlasEntries() {
  if (!state.recognitionCategoryID || state.recognitionCategoryID === "all") return state.atlas;
  return state.atlas.filter(entry => (entry.categoryID || DEFAULT_CATEGORY_ID) === state.recognitionCategoryID);
}

function totalAtlasPages() {
  return Math.max(1, Math.ceil(currentCategoryEntries().length / ATLAS_PAGE_SIZE));
}

function clampAtlasPage() {
  state.atlasPage = Math.min(state.atlasPage, Math.max(0, totalAtlasPages() - 1));
}

function setAtlasMessage(message) {
  els.atlasMessage.textContent = message || "点砖块可改名、转移分类或删除。导入会加入当前分类。";
}

function addCategoryFromModal() {
  const name = els.categoryNameInput.value.trim();
  if (!name || state.categories.some(item => normalizeName(item.name) === normalizeName(name))) {
    setAtlasMessage("分类名称不能为空或重复");
    return;
  }
  const category = { id: crypto.randomUUID(), name };
  state.categories.push(category);
  state.selectedCategoryID = category.id;
  state.atlasPage = 0;
  persistAtlas();
  renderAtlas();
  setAtlasMessage(`已添加分类：${name}`);
  closeModal(els.categoryModal);
}

function openTileMenu(uuid) {
  const entry = state.atlas.find(item => item.uuid === uuid);
  if (!entry) return;
  state.activeTileID = uuid;
  els.tileMenuTitle.textContent = entry.name;
  els.moveTileCategorySelect.innerHTML = "";
  for (const category of state.categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    els.moveTileCategorySelect.appendChild(option);
  }
  els.moveTileCategorySelect.value = entry.categoryID || DEFAULT_CATEGORY_ID;
  openModal(els.tileMenuModal);
}

function renameActiveTile() {
  const entry = state.atlas.find(item => item.uuid === state.activeTileID);
  if (!entry) return;
  const name = prompt("名称不能与已有砖块重复。", entry.name)?.trim();
  if (!name) return;
  if (state.atlas.some(item => item.uuid !== entry.uuid && normalizeName(item.name) === normalizeName(name))) {
    alert("名称重复");
    return;
  }
  entry.name = name;
  persistAtlas();
  renderAtlas();
  closeModal(els.tileMenuModal);
  if (state.image) recognizeCurrentImage();
}

function moveActiveTile() {
  const entry = state.atlas.find(item => item.uuid === state.activeTileID);
  if (!entry) return;
  entry.categoryID = els.moveTileCategorySelect.value;
  persistAtlas();
  renderAtlas();
  closeModal(els.tileMenuModal);
  if (state.image) recognizeCurrentImage();
}

function deleteActiveTile() {
  const entry = state.atlas.find(item => item.uuid === state.activeTileID);
  if (!entry || !confirm(`确定删除「${entry.name}」吗？`)) return;
  state.atlas = state.atlas.filter(item => item.uuid !== entry.uuid);
  state.selectedTileIDs.delete(entry.uuid);
  normalizeAtlasNumericIDs();
  clampAtlasPage();
  persistAtlas();
  renderAtlas();
  closeModal(els.tileMenuModal);
  if (state.image) recognizeCurrentImage();
}

async function prepareDirectTileImports(files) {
  if (!files.length) return;
  setAtlasMessage("正在读取砖块图片...");
  const used = new Set(state.atlas.map(entry => normalizeName(entry.name)));
  const drafts = [];
  for (const file of files) {
    const entry = await addAtlasImage(file).catch(() => null);
    if (!entry) continue;
    let name = entry.name || nextAvailableAtlasName("砖块", used);
    if (!name || used.has(normalizeName(name))) name = nextAvailableAtlasName("砖块", used);
    used.add(normalizeName(name));
    drafts.push({
      ...entry,
      draftID: crypto.randomUUID(),
      name,
      categoryID: state.selectedCategoryID,
      selected: true,
      duplicateMode: "rename",
      renameTo: nextAvailableAtlasName(name || "砖块", used)
    });
  }
  if (!drafts.length) {
    setAtlasMessage("没有读到可导入的砖块图片");
    return;
  }
  state.importDrafts = drafts;
  state.importPreview = null;
  state.importCutPreview = null;
  renderImportDrafts();
  openModal(els.importReviewModal);
}

async function prepareScreenshotTileImports(file) {
  setAtlasMessage("正在切割截图...");
  const src = await readFileAsDataURL(file);
  const image = await loadImage(src);
  const templateGrid = detectAtlasTemplateGrid(image);
  const grid = templateGrid || detectGrid(image);
  const rows = templateGrid ? 4 : ROWS;
  const cols = templateGrid ? 5 : COLS;
  const cells = grid.cells || cellRectsFromGrid(grid, rows, cols);
  const used = new Set(state.atlas.map(entry => normalizeName(entry.name)));
  const drafts = [];
  for (const rect of cells) {
    const cropRect = templateGrid ? cropAtlasTemplateTileContent(rect) : insetAtlasCropRect(rect);
    const imageData = cropImageToDataURL(image, cropRect, 120, 120, templateGrid ? {
      fit: "contain",
      background: "#eef8c8"
    } : undefined);
    const tileImage = await loadImage(imageData);
    const name = nextAvailableAtlasName("图鉴", used);
    used.add(normalizeName(name));
    drafts.push({
      id: nextAtlasNumericID(drafts),
      uuid: crypto.randomUUID(),
      draftID: crypto.randomUUID(),
      name,
      categoryID: state.selectedCategoryID,
      imageData,
      image: tileImage,
      feature: featureFromImage(tileImage),
      pixelFeature: pixelFeatureFromImage(tileImage),
      iconFeature: iconFeatureFromImage(tileImage),
      colorFeature: colorFeatureFromImage(tileImage),
      selected: false,
      duplicateMode: "rename",
      renameTo: nextAvailableAtlasName(name, used),
      userAdded: true
    });
  }
  state.importDrafts = drafts;
  state.importPreview = { image, grid, rows, cols };
  state.importCutPreview = { drafts, rows, cols };
  renderImportDrafts();
  openModal(els.importReviewModal);
}

function insetAtlasCropRect(rect) {
  const side = Math.min(rect.w, rect.h);
  const insetX = Math.min(4, Math.max(1, side * 0.015));
  const insetTop = Math.min(4, Math.max(1, side * 0.012));
  const insetBottom = Math.min(2, Math.max(0, side * 0.006));
  return {
    x: rect.x + insetX,
    y: rect.y + insetTop,
    w: Math.max(1, rect.w - insetX * 2),
    h: Math.max(1, rect.h - insetTop - insetBottom)
  };
}

function cropAtlasTemplateTileContent(rect) {
  const cardSide = Math.min(rect.w, rect.h);
  const insetX = cardSide * 0.006;
  const insetTop = cardSide * 0.070;
  const contentW = Math.max(1, cardSide - insetX * 2);
  const contentH = Math.max(1, cardSide * 0.860);
  return {
    x: rect.x + (rect.w - cardSide) / 2 + insetX,
    y: rect.y + insetTop,
    w: contentW,
    h: contentH
  };
}

function detectAtlasTemplateGrid(image) {
  const canvas = makeCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  const componentGrid = detectAtlasTemplateByComponents(data, width, height);
  if (componentGrid) return componentGrid;

  const stride = Math.max(1, Math.floor(Math.max(width, height) / 900));
  let minX = width, minY = height, maxX = 0, maxY = 0, hits = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (isTileInterior(r, g, b)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        hits++;
      }
    }
  }
  if (hits < 60) return null;
  const w = maxX - minX;
  const h = maxY - minY;
  const ratio = w / Math.max(1, h);
  if (ratio < 1.05 || ratio > 1.55) return null;
  const rect = {
    x: minX - stride * 1.5,
    y: minY - stride * 1.5,
    w: w + stride * 3,
    h: h + stride * 3
  };
  return tightenGridRect(snapGridByLines(rect, data, width, height));
}

function detectAtlasTemplateByComponents(data, width, height) {
  const sampleW = Math.min(520, width);
  const scale = sampleW / width;
  const sampleH = Math.max(1, Math.round(height * scale));
  const mask = new Uint8Array(sampleW * sampleH);
  for (let y = 0; y < sampleH; y++) {
    const sourceY = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < sampleW; x++) {
      const sourceX = Math.min(width - 1, Math.floor(x / scale));
      const p = (sourceY * width + sourceX) * 4;
      if (isTileInterior(data[p], data[p + 1], data[p + 2]) || isAtlasTileFrame(data[p], data[p + 1], data[p + 2])) {
        mask[y * sampleW + x] = 1;
      }
    }
  }

  const components = connectedMaskComponents(mask, sampleW, sampleH);
  const candidates = components
    .map(box => ({
      ...box,
      w: box.maxX - box.minX + 1,
      h: box.maxY - box.minY + 1,
      density: box.count / Math.max(1, (box.maxX - box.minX + 1) * (box.maxY - box.minY + 1))
    }))
    .filter(box => {
      const aspect = box.w / Math.max(1, box.h);
      return box.w >= sampleW * 0.055 &&
        box.h >= sampleW * 0.055 &&
        aspect >= 0.68 &&
        aspect <= 1.28 &&
        box.density >= 0.22;
    });

  if (candidates.length < 20) return null;
  const medianW = median(candidates.map(box => box.w));
  const medianH = median(candidates.map(box => box.h));
  const cells = candidates
    .filter(box => box.w >= medianW * 0.65 && box.w <= medianW * 1.4 && box.h >= medianH * 0.65 && box.h <= medianH * 1.4)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX);

  if (cells.length !== 20) return null;
  const cellSize = median(cells.map(box => box.w)) / scale;
  const rects = cells.map(box => {
    const pad = Math.max(1, cellSize * 0.012);
    const x = Math.max(0, box.minX / scale - pad);
    const y = Math.max(0, box.minY / scale - pad);
    const w = Math.min(width - x, box.w / scale + pad * 2);
    const h = Math.min(height - y, box.h / scale + pad * 2);
    return {
      x,
      y,
      w,
      h
    };
  }).sort((a, b) => {
    const rowA = Math.round(a.y / Math.max(1, cellSize * 0.55));
    const rowB = Math.round(b.y / Math.max(1, cellSize * 0.55));
    return rowA - rowB || a.x - b.x;
  });

  const minX = Math.max(0, Math.min(...rects.map(rect => rect.x)));
  const minY = Math.max(0, Math.min(...rects.map(rect => rect.y)));
  const maxX = Math.min(width, Math.max(...rects.map(rect => rect.x + rect.w)));
  const maxY = Math.min(height, Math.max(...rects.map(rect => rect.y + rect.h)));
  const grid = {
    x: minX,
    y: minY,
    w: Math.max(10, maxX - minX),
    h: Math.max(10, maxY - minY),
    cells: rects
  };
  const gridRatio = grid.w / Math.max(1, grid.h);
  if (gridRatio < 0.9 || gridRatio > 1.75) return null;
  return grid;
}

function connectedMaskComponents(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const components = [];
  const stack = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (seen[start] || !mask[start]) continue;
      let minX = x, maxX = x, minY = y, maxY = y, count = 0;
      stack.length = 0;
      stack.push(start);
      seen[start] = 1;
      while (stack.length) {
        const index = stack.pop();
        const cx = index % width;
        const cy = Math.floor(index / width);
        count++;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (let yy = cy - 1; yy <= cy + 1; yy++) {
          for (let xx = cx - 1; xx <= cx + 1; xx++) {
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            const next = yy * width + xx;
            if (seen[next] || !mask[next]) continue;
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
      components.push({ minX, minY, maxX, maxY, count });
    }
  }
  return components;
}

function cellRectsFromGrid(grid, rows = ROWS, cols = COLS) {
  const cells = [];
  const cellW = grid.w / cols;
  const cellH = grid.h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: grid.x + c * cellW,
        y: grid.y + r * cellH,
        w: cellW,
        h: cellH
      });
    }
  }
  return cells;
}

function cropImageToDataURL(image, rect, outW = 120, outH = 120, options = {}) {
  const canvas = makeCanvas(outW, outH);
  const ctx = canvas.getContext("2d");
  if (options.fit === "contain") {
    ctx.fillStyle = options.background || "#eef8c8";
    ctx.fillRect(0, 0, outW, outH);
    const scale = Math.min(outW / rect.w, outH / rect.h);
    const drawW = rect.w * scale;
    const drawH = rect.h * scale;
    const drawX = (outW - drawW) / 2;
    const drawY = (outH - drawH) / 2;
    ctx.drawImage(
      image,
      rect.x, rect.y, rect.w, rect.h,
      drawX, drawY, drawW, drawH
    );
    return canvas.toDataURL("image/png");
  }
  ctx.drawImage(
    image,
    rect.x, rect.y, rect.w, rect.h,
    0, 0, outW, outH
  );
  return canvas.toDataURL("image/png");
}

function renderImportDrafts() {
  const drafts = state.importDrafts || [];
  els.importPreviewSection.hidden = !state.importPreview;
  els.importCutSection.hidden = !state.importCutPreview;
  if (state.importPreview) {
    drawPreviewToCanvas(
      els.importPreviewCanvas,
      state.importPreview.image,
      state.importPreview.grid,
      state.importPreview.rows,
      state.importPreview.cols
    );
  }
  if (state.importCutPreview) {
    drawCutPreviewCanvas(els.importCutCanvas, drafts, state.importCutPreview.rows, state.importCutPreview.cols);
  }

  const allSelected = drafts.length > 0 && drafts.every(draft => draft.selected);
  els.selectAllDraftsButton.textContent = allSelected ? "取消全选" : "全选";
  els.saveImportButton.disabled = !drafts.some(draft => draft.selected);
  els.draftList.innerHTML = "";
  for (const draft of drafts) {
    const duplicate = state.atlas.find(entry => normalizeName(entry.name) === normalizeName(draft.name));
    const row = document.createElement("article");
    row.className = "draft-row";
    row.innerHTML = `
      <label class="draft-check">
        <input type="checkbox" ${draft.selected ? "checked" : ""}>
      </label>
      <img src="${draft.imageData}" alt="">
      <div class="draft-fields">
        <input class="text-input draft-name" type="text" value="${escapeHtml(draft.name)}">
        ${duplicate ? `
          <div class="duplicate-box">
            <span>发现同名：${escapeHtml(duplicate.name)}</span>
            <select class="duplicate-mode">
              <option value="overwrite" ${draft.duplicateMode === "overwrite" ? "selected" : ""}>覆盖</option>
              <option value="rename" ${draft.duplicateMode !== "overwrite" ? "selected" : ""}>重命名</option>
            </select>
          </div>
        ` : ""}
      </div>
    `;
    row.querySelector("input[type='checkbox']").addEventListener("change", event => {
      draft.selected = event.target.checked;
      renderImportDrafts();
    });
    row.querySelector(".draft-name").addEventListener("input", event => {
      draft.name = event.target.value;
    });
    row.querySelector(".duplicate-mode")?.addEventListener("change", event => {
      draft.duplicateMode = event.target.value;
      renderImportDrafts();
    });
    els.draftList.appendChild(row);
  }
}

function drawPreviewToCanvas(canvas, image, grid, rows = ROWS, cols = COLS) {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  ctx.save();
  ctx.strokeStyle = "#ffd100";
  ctx.lineWidth = Math.max(2, image.naturalWidth / 360);
  ctx.strokeRect(grid.x, grid.y, grid.w, grid.h);
  ctx.strokeStyle = "rgba(255,55,75,.72)";
  ctx.lineWidth = Math.max(1, image.naturalWidth / 900);
  if (grid.cells) {
    for (const rect of grid.cells) {
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
  } else {
    for (let c = 1; c < cols; c++) {
      const x = grid.x + grid.w * c / cols;
      ctx.beginPath();
      ctx.moveTo(x, grid.y);
      ctx.lineTo(x, grid.y + grid.h);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      const y = grid.y + grid.h * r / rows;
      ctx.beginPath();
      ctx.moveTo(grid.x, y);
      ctx.lineTo(grid.x + grid.w, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCutPreviewCanvas(canvas, drafts, rows, cols) {
  const size = 78;
  const gap = 8;
  canvas.width = cols * size + (cols + 1) * gap;
  canvas.height = rows * size + (rows + 1) * gap;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drafts.forEach((draft, index) => {
    const r = Math.floor(index / cols);
    const c = index % cols;
    const x = gap + c * (size + gap);
    const y = gap + r * (size + gap);
    ctx.fillStyle = "#eef8c8";
    ctx.strokeStyle = "#7b8e39";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, size, size, 8);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(draft.image, x + 3, y + 3, size - 6, size - 6);
  });
}

function saveImportDrafts() {
  const selected = state.importDrafts.filter(draft => draft.selected);
  if (!selected.length) return;
  let added = 0;
  let overwritten = 0;
  for (const draft of selected) {
    const name = draft.name.trim() || nextAvailableAtlasName("图鉴");
    const existingIndex = state.atlas.findIndex(entry => normalizeName(entry.name) === normalizeName(name));
    const entry = {
      id: nextAtlasNumericID(),
      uuid: draft.uuid || crypto.randomUUID(),
      name,
      categoryID: draft.categoryID || state.selectedCategoryID,
      imageData: draft.imageData,
      image: draft.image,
      feature: draft.feature,
      pixelFeature: draft.pixelFeature || pixelFeatureFromImage(draft.image),
      iconFeature: draft.iconFeature || iconFeatureFromImage(draft.image),
      colorFeature: draft.colorFeature || colorFeatureFromImage(draft.image),
      userAdded: true
    };
    if (existingIndex >= 0 && draft.duplicateMode === "overwrite") {
      entry.id = state.atlas[existingIndex].id;
      entry.uuid = state.atlas[existingIndex].uuid;
      state.atlas[existingIndex] = entry;
      overwritten++;
    } else {
      if (existingIndex >= 0) entry.name = nextAvailableAtlasName(name);
      state.atlas.push(entry);
      added++;
    }
  }
  state.importDrafts = [];
  state.importPreview = null;
  state.importCutPreview = null;
  state.recognitionCategoryID = state.selectedCategoryID;
  normalizeAtlasNumericIDs();
  clampAtlasPage();
  persistAtlas();
  renderAtlas();
  renderRecognitionCategoryOptions();
  closeModal(els.importReviewModal);
  setAtlasMessage(`已导入 ${added} 个砖块${overwritten ? `，覆盖 ${overwritten} 个` : ""}`);
  if (state.image) recognizeCurrentImage();
}

function nextAvailableAtlasName(prefix = "砖块", used = null) {
  const names = used || new Set(state.atlas.map(entry => normalizeName(entry.name)));
  let i = 1;
  while (names.has(normalizeName(`${prefix}${i}`))) i++;
  return `${prefix}${i}`;
}

function normalizeName(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function openModal(modal) {
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal(modal) {
  modal.hidden = true;
  if (![els.categoryModal, els.importReviewModal, els.tileMenuModal].some(item => item && !item.hidden)) {
    document.body.classList.remove("modal-open");
  }
}

async function ensureEmbeddingModel() {
  if (state.embeddingModel || state.embeddingModelFailed) return state.embeddingModel;
  if (!state.embeddingModelPromise) {
    state.embeddingModelPromise = loadEmbeddingModel().catch(error => {
      console.warn("Embedding model unavailable, falling back to fingerprint matching.", error);
      state.embeddingModelFailed = true;
      return null;
    });
  }
  state.embeddingModel = await Promise.race([
    state.embeddingModelPromise,
    new Promise(resolve => setTimeout(() => resolve(null), 3000))
  ]);
  return state.embeddingModel;
}

async function loadEmbeddingModel() {
  setStatus("加载识别模型", "首次使用会下载小型视觉模型。");
  await loadScriptOnce("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
  await loadScriptOnce("https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js");
  if (!window.mobilenet) throw new Error("MobileNet failed to load");
  return window.mobilenet.load({ version: 2, alpha: 0.25 });
}

function loadScriptOnce(src) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return existing.dataset.loaded === "true"
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
        });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });
}

function downloadCanvas(canvas, filename) {
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = canvas.toDataURL("image/png");
  anchor.click();
}

async function loadScreenshot(file) {
  setStatus("读取截图", "正在加载图片。");
  const src = await readFileAsDataURL(file);
  state.sourceDataURL = src;
  state.image = await loadImage(src);
  state.steps = [];
  state.stepBoards = [];
  state.stepIndex = 0;
  showResult(false);
  els.sourceImage.src = src;
  els.sourceImage.classList.add("visible");
  els.emptyPreview.style.display = "none";
  els.uploadButtonText.textContent = "更换截图";
  setCanvasEnabled("cutPreview", false);
  setCanvasEnabled("correction", false);
  setCanvasMode("screenshot");
  await recognizeCurrentImage();
  setCanvasMode("cutPreview");
}

async function recognizeCurrentImage() {
  if (!state.image) return;
  const started = performance.now();
  await ensureEmbeddingModel();
  state.grid = detectGrid(state.image);
  drawPreview();
  await recognizeBoard();
  renderBoard(els.correctionBoard, state.board, { editable: true });
  setCanvasEnabled("cutPreview", true);
  setCanvasEnabled("correction", true);
  const unknowns = state.board.filter(value => value >= 1_000_000).length;
  const count = tileCount(state.board);
  els.tileCountBadge.textContent = `${count} 块`;
  els.solveButton.disabled = count === 0;
  els.savePreviewButton.disabled = false;
  els.warningMessage.hidden = unknowns === 0;
  els.warningMessage.textContent = unknowns ? `还有 ${unknowns} 块未命中图鉴，可在校正页点格子调整。` : "";
  setStatus("识别完成", `用时 ${((performance.now() - started) / 1000).toFixed(1)} 秒，未命中 ${unknowns} 块。`);
}

function detectGrid(image) {
  const canvas = makeCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  const centerGrid = detectGridFromTileCenters(image);
  if (centerGrid) return centerGrid;

  const regularGrid = detectRegularBoardGrid(data, width, height);
  if (regularGrid) return regularGrid;

  const stride = Math.max(1, Math.floor(Math.max(width, height) / 900));
  let minX = width, minY = height, maxX = 0, maxY = 0, hits = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (isTileInterior(r, g, b)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        hits += 1;
      }
    }
  }

  if (hits < 200) {
    const w = width * 0.94;
    return { x: (width - w) / 2, y: height * 0.24, w, h: w * ROWS / COLS };
  }

  const lineGrid = detectGridFromLineProjection({ minX, minY, maxX, maxY }, data, width, height);
  if (lineGrid) return tightenGridRect(lineGrid);

  const fallback = {
    x: minX - stride * 1.5,
    y: minY - stride * 1.5,
    w: maxX - minX + stride * 3,
    h: maxY - minY + stride * 3
  };
  return tightenGridRect(snapGridByLines(fallback, data, width, height));
}

function detectGridFromTileCenters(image) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const longest = Math.max(sourceWidth, sourceHeight);
  const scale = longest > 1400 ? 1400 / longest : 1;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const components = tileInteriorComponents(data, width, height);
  if (components.length < 80) return null;

  const xAxis = bestCenterAxis(components, "x", COLS, width * 0.045, width * 0.13, width);
  const yAxis = bestCenterAxis(components, "y", ROWS, height * 0.032, height * 0.13, height);
  if (!xAxis || !yAxis) return null;

  const rect = {
    x: xAxis.start / scale,
    y: yAxis.start / scale,
    w: (xAxis.end - xAxis.start) / scale,
    h: (yAxis.end - yAxis.start) / scale,
    confidence: Math.min(xAxis.confidence, yAxis.confidence)
  };
  const cellW = rect.w / COLS;
  const cellH = rect.h / ROWS;
  const aspect = cellW / Math.max(1, cellH);
  if (aspect < 0.82 || aspect > 1.18 || rect.confidence < 0.42) return null;
  if (rect.x < -2 || rect.y < -2 || rect.x + rect.w > sourceWidth + 2 || rect.y + rect.h > sourceHeight + 2) return null;
  return {
    x: Math.max(0, rect.x),
    y: Math.max(0, rect.y),
    w: Math.min(sourceWidth - Math.max(0, rect.x), rect.w),
    h: Math.min(sourceHeight - Math.max(0, rect.y), rect.h),
    confidence: rect.confidence
  };
}

function tileInteriorComponents(data, width, height) {
  const total = width * height;
  const mask = new Uint8Array(total);
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    if (isTileInterior(data[p], data[p + 1], data[p + 2])) mask[i] = 1;
  }

  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  const components = [];
  const minSide = Math.max(10, Math.min(width, height) * 0.018);
  const maxSide = Math.max(minSide + 2, Math.min(width, height) * 0.16);
  const minArea = Math.max(90, minSide * minSide * 0.30);

  for (let index = 0; index < total; index++) {
    if (!mask[index] || visited[index]) continue;
    let top = 0;
    stack[top++] = index;
    visited[index] = 1;
    let area = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;

    while (top > 0) {
      const current = stack[--top];
      const x = current % width;
      const y = Math.floor(current / width);
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const left = current - 1;
      const right = current + 1;
      const up = current - width;
      const down = current + width;
      if (x > 0 && mask[left] && !visited[left]) {
        visited[left] = 1;
        stack[top++] = left;
      }
      if (x < width - 1 && mask[right] && !visited[right]) {
        visited[right] = 1;
        stack[top++] = right;
      }
      if (y > 0 && mask[up] && !visited[up]) {
        visited[up] = 1;
        stack[top++] = up;
      }
      if (y < height - 1 && mask[down] && !visited[down]) {
        visited[down] = 1;
        stack[top++] = down;
      }
    }

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const ratio = w / Math.max(1, h);
    if (
      area >= minArea &&
      w >= minSide &&
      h >= minSide &&
      w <= maxSide &&
      h <= maxSide &&
      ratio >= 0.55 &&
      ratio <= 1.45
    ) {
      components.push({
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        area,
        w,
        h
      });
    }
  }
  return components;
}

function bestCenterAxis(components, axis, divisions, minCell, maxCell, length) {
  const scores = new Float32Array(length);
  for (const component of components) {
    const pos = Math.round(component[axis]);
    if (pos >= 0 && pos < length) {
      scores[pos] += Math.min(12, Math.sqrt(component.area));
    }
  }
  const min = Math.max(8, Math.round(minCell));
  const max = Math.max(min, Math.round(maxCell));
  let best = null;

  for (let cell = min; cell <= max; cell++) {
    const radius = Math.max(2, Math.round(cell * 0.16));
    const startStep = Math.max(1, Math.round(cell / 24));
    for (let start = 0; start + cell * divisions < length; start += startStep) {
      let hits = 0;
      let totalScore = 0;
      let spreadPenalty = 0;
      for (let k = 0; k < divisions; k++) {
        const center = Math.round(start + cell * (k + 0.5));
        let localBest = 0;
        let bestDistance = radius + 1;
        for (let p = Math.max(0, center - radius); p <= Math.min(length - 1, center + radius); p++) {
          if (scores[p] > localBest) {
            localBest = scores[p];
            bestDistance = Math.abs(p - center);
          }
        }
        if (localBest > 0) hits++;
        totalScore += localBest;
        spreadPenalty += bestDistance / Math.max(1, radius);
      }
      const confidence = hits / divisions;
      if (confidence < 0.78) continue;
      const score = totalScore + hits * 18 - spreadPenalty * 2;
      if (!best || score > best.score) {
        best = { start, end: start + cell * divisions, cell, score, confidence };
      }
    }
  }
  return best;
}

function detectRegularBoardGrid(data, width, height) {
  const verticalScores = boardLineScores(data, width, height, "vertical");
  const horizontalScores = boardLineScores(data, width, height, "horizontal");
  const xGrid = bestRegularAxis(verticalScores, COLS, width * 0.075, width * 0.115, 0, width * 0.08);
  const yGrid = bestRegularAxis(horizontalScores, ROWS, width * 0.075, width * 0.115, height * 0.12, height * 0.38);
  if (!xGrid || !yGrid) return null;

  const rect = {
    x: xGrid.start,
    y: yGrid.start,
    w: xGrid.end - xGrid.start,
    h: yGrid.end - yGrid.start,
    confidence: Math.min(xGrid.confidence, yGrid.confidence)
  };
  const cellW = rect.w / COLS;
  const cellH = rect.h / ROWS;
  const aspect = cellW / cellH;
  if (aspect < 0.82 || aspect > 1.18 || rect.confidence < 0.34) return null;
  return rect;
}

function boardLineScores(data, width, height, axis) {
  const scores = [];
  if (axis === "vertical") {
    const yStep = Math.max(1, Math.floor(height / 760));
    const startY = Math.round(height * 0.12);
    const endY = Math.round(height * 0.94);
    for (let x = 0; x < width; x++) {
      let score = 0;
      for (let y = startY; y <= endY; y += yStep) {
        const p = (y * width + x) * 4;
        if (isBoardSeparator(data[p], data[p + 1], data[p + 2])) score++;
      }
      scores.push(score);
    }
    return smoothScores(scores, 3);
  }

  const xStep = Math.max(1, Math.floor(width / 560));
  for (let y = 0; y < height; y++) {
    let score = 0;
    for (let x = 0; x < width; x += xStep) {
      const p = (y * width + x) * 4;
      if (isBoardSeparator(data[p], data[p + 1], data[p + 2])) score++;
    }
    scores.push(score);
  }
  return smoothScores(scores, 3);
}

function bestRegularAxis(scores, divisions, minCell, maxCell, minStart, maxStart) {
  let best = null;
  const min = Math.max(8, Math.round(minCell));
  const max = Math.max(min, Math.round(maxCell));
  for (let cell = min; cell <= max; cell++) {
    const startStep = Math.max(1, Math.floor(cell / 35));
    for (let start = Math.max(0, Math.round(minStart)); start <= Math.round(maxStart); start += startStep) {
      const end = start + cell * divisions;
      if (end >= scores.length) continue;
      const score = regularAxisScore(scores, start, end, divisions);
      if (!best || score > best.score) {
        best = { start, end, cell, score };
      }
    }
  }
  if (!best) return null;
  const maxScore = Math.max(...scores, 1);
  return {
    start: best.start,
    end: best.end,
    cell: best.cell,
    score: best.score,
    confidence: best.score / maxScore
  };
}

function regularAxisScore(scores, start, end, divisions) {
  const cell = (end - start) / divisions;
  let score = 0;
  for (let k = 0; k <= divisions; k++) {
    const target = Math.round(start + cell * k);
    const radius = Math.max(2, Math.round(cell * 0.08));
    let best = 0;
    for (let i = Math.max(0, target - radius); i <= Math.min(scores.length - 1, target + radius); i++) {
      best = Math.max(best, scores[i]);
    }
    score += best;
  }
  return score / (divisions + 1);
}

function tightenGridRect(rect) {
  const cellW = rect.w / COLS;
  const cellH = rect.h / ROWS;
  const leftInset = cellW * 0.028;
  const rightInset = cellW * 0.028;
  const topInset = cellH * 0.02;
  const bottomInset = cellH * 0.09;
  return {
    ...rect,
    x: rect.x + leftInset,
    y: rect.y + topInset,
    w: Math.max(10, rect.w - leftInset - rightInset),
    h: Math.max(10, rect.h - topInset - bottomInset)
  };
}

function detectGridFromLineProjection(tileBox, data, width, height) {
  const tileW = tileBox.maxX - tileBox.minX;
  const tileH = tileBox.maxY - tileBox.minY;
  if (tileW < 80 || tileH < 120) return null;

  const roughCellW = tileW / COLS;
  const roughCellH = tileH / ROWS;
  const padX = Math.round(roughCellW * 0.65);
  const padY = Math.round(roughCellH * 0.65);
  const sx = Math.max(0, Math.round(tileBox.minX - padX));
  const ex = Math.min(width - 1, Math.round(tileBox.maxX + padX));
  const sy = Math.max(0, Math.round(tileBox.minY - padY));
  const ey = Math.min(height - 1, Math.round(tileBox.maxY + padY));

  const yStep = Math.max(1, Math.floor((ey - sy) / 520));
  const xStep = Math.max(1, Math.floor((ex - sx) / 520));
  const verticalScores = [];
  for (let x = sx; x <= ex; x++) {
    let score = 0;
    for (let y = sy; y <= ey; y += yStep) {
      const p = (y * width + x) * 4;
      if (isBoardSeparator(data[p], data[p + 1], data[p + 2])) score++;
    }
    verticalScores.push(score);
  }
  const horizontalScores = [];
  for (let y = sy; y <= ey; y++) {
    let score = 0;
    for (let x = sx; x <= ex; x += xStep) {
      const p = (y * width + x) * 4;
      if (isBoardSeparator(data[p], data[p + 1], data[p + 2])) score++;
    }
    horizontalScores.push(score);
  }

  const verticalPeaks = findLinePeaks(
    smoothScores(verticalScores, Math.max(1, Math.round(roughCellW * 0.025))),
    sx,
    roughCellW * 0.34
  );
  const horizontalPeaks = findLinePeaks(
    smoothScores(horizontalScores, Math.max(1, Math.round(roughCellH * 0.025))),
    sy,
    roughCellH * 0.34
  );

  const xGrid = chooseEquidistantGrid(verticalPeaks, COLS, tileBox.minX, tileBox.maxX);
  const yGrid = chooseEquidistantGrid(horizontalPeaks, ROWS, tileBox.minY, tileBox.maxY);
  if (!xGrid || !yGrid) return null;

  const rect = {
    x: xGrid.start,
    y: yGrid.start,
    w: xGrid.end - xGrid.start,
    h: yGrid.end - yGrid.start,
    confidence: Math.min(xGrid.confidence, yGrid.confidence)
  };
  const cellW = rect.w / COLS;
  const cellH = rect.h / ROWS;
  const aspect = cellW / cellH;
  if (aspect < 0.82 || aspect > 1.18 || rect.confidence < 0.38) return null;
  return rect;
}

function isBoardSeparator(r, g, b) {
  return isGridLine(r, g, b) || isBrownFrame(r, g, b);
}

function smoothScores(scores, radius) {
  const out = [];
  const prefix = [0];
  for (const score of scores) prefix.push(prefix[prefix.length - 1] + score);
  for (let i = 0; i < scores.length; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(scores.length - 1, i + radius);
    out.push((prefix[b + 1] - prefix[a]) / (b - a + 1));
  }
  return out;
}

function findLinePeaks(scores, offset, minDistance) {
  const maxScore = Math.max(...scores, 0);
  if (maxScore <= 0) return [];
  const threshold = maxScore * 0.45;
  const candidates = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] >= threshold) candidates.push({ score: scores[i], pos: offset + i });
  }
  candidates.sort((a, b) => b.score - a.score);
  const peaks = [];
  for (const candidate of candidates) {
    if (peaks.every(pos => Math.abs(pos - candidate.pos) > minDistance)) {
      peaks.push(candidate.pos);
    }
    if (peaks.length >= 50) break;
  }
  peaks.sort((a, b) => a - b);
  return peaks;
}

function chooseEquidistantGrid(peaks, divisions, roughStart, roughEnd) {
  if (peaks.length < 2) return null;
  const expectedCell = (roughEnd - roughStart) / divisions;
  let best = null;
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < peaks.length; j++) {
      const start = peaks[i];
      const end = peaks[j];
      const span = end - start;
      const cell = span / divisions;
      if (cell < expectedCell * 0.45 || cell > expectedCell * 1.55) continue;

      let hits = 0;
      let error = 0;
      for (let k = 0; k <= divisions; k++) {
        const target = start + cell * k;
        const nearest = peaks.reduce((bestDistance, pos) => Math.min(bestDistance, Math.abs(pos - target)), Infinity);
        if (nearest < cell * 0.18) {
          hits++;
          error += nearest / cell;
        } else {
          error += 1;
        }
      }
      const expectedPenalty = Math.abs(cell - expectedCell) / Math.max(1, expectedCell);
      const score = hits * 4 - error - expectedPenalty;
      const confidence = hits / (divisions + 1);
      if (!best || score > best.score) {
        best = { start, end, cell, hits, error, score, confidence };
      }
    }
  }
  return best;
}

function snapGridByLines(rect, data, width, height) {
  const searchX = Math.max(4, Math.round(rect.w / COLS * 0.28));
  const searchY = Math.max(4, Math.round(rect.h / ROWS * 0.28));
  const left = bestVerticalLine(rect.x, rect.y, rect.h, searchX, data, width, height);
  const right = bestVerticalLine(rect.x + rect.w, rect.y, rect.h, searchX, data, width, height);
  const top = bestHorizontalLine(rect.y, rect.x, rect.w, searchY, data, width, height);
  const bottom = bestHorizontalLine(rect.y + rect.h, rect.x, rect.w, searchY, data, width, height);
  const snapped = {
    x: left ?? rect.x,
    y: top ?? rect.y,
    w: (right ?? rect.x + rect.w) - (left ?? rect.x),
    h: (bottom ?? rect.y + rect.h) - (top ?? rect.y)
  };
  return {
    x: Math.max(0, snapped.x),
    y: Math.max(0, snapped.y),
    w: Math.max(10, snapped.w),
    h: Math.max(10, snapped.h)
  };
}

function bestVerticalLine(centerX, y, h, radius, data, width, height) {
  let best = null;
  for (let x = Math.max(0, Math.round(centerX - radius)); x <= Math.min(width - 1, Math.round(centerX + radius)); x++) {
    let score = 0;
    const samples = 90;
    for (let i = 0; i < samples; i++) {
      const yy = Math.round(y + h * i / (samples - 1));
      if (yy < 0 || yy >= height) continue;
      const p = (yy * width + x) * 4;
      if (isGridLine(data[p], data[p + 1], data[p + 2]) || isBrownFrame(data[p], data[p + 1], data[p + 2])) score++;
    }
    if (!best || score > best.score) best = { x, score };
  }
  return best && best.score > 20 ? best.x : null;
}

function bestHorizontalLine(centerY, x, w, radius, data, width, height) {
  let best = null;
  for (let y = Math.max(0, Math.round(centerY - radius)); y <= Math.min(height - 1, Math.round(centerY + radius)); y++) {
    let score = 0;
    const samples = 90;
    for (let i = 0; i < samples; i++) {
      const xx = Math.round(x + w * i / (samples - 1));
      if (xx < 0 || xx >= width) continue;
      const p = (y * width + xx) * 4;
      if (isGridLine(data[p], data[p + 1], data[p + 2]) || isBrownFrame(data[p], data[p + 1], data[p + 2])) score++;
    }
    if (!best || score > best.score) best = { y, score };
  }
  return best && best.score > 20 ? best.y : null;
}

function isTileInterior(r, g, b) {
  return r > 214 && g > 226 && b > 160 && g >= r - 10 && g > b + 22;
}

function isGridLine(r, g, b) {
  return g > 55 && g < 150 && r > 35 && r < 150 && b < 95 && g >= r - 35;
}

function isAtlasTileFrame(r, g, b) {
  const greenFrame = g > 70 && g < 155 && r > 35 && r < 140 && b < 90 && g >= r - 20;
  const shadowFrame = r > 25 && r < 95 && g > 45 && g < 110 && b < 65 && g >= r - 8;
  return greenFrame || shadowFrame;
}

function isBrownFrame(r, g, b) {
  return r > 110 && r < 220 && g > 55 && g < 160 && b < 95 && r > g + 20;
}

function drawPreview() {
  const canvas = els.previewCanvas;
  const image = state.image;
  const grid = state.grid;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  if (grid) {
    ctx.save();
    ctx.lineWidth = Math.max(2, image.naturalWidth / 360);
    ctx.strokeStyle = "#ffd100";
    ctx.strokeRect(grid.x, grid.y, grid.w, grid.h);
    ctx.strokeStyle = "rgba(255, 55, 75, .72)";
    ctx.lineWidth = Math.max(1, image.naturalWidth / 900);
    for (let c = 1; c < COLS; c++) {
      const x = grid.x + grid.w * c / COLS;
      ctx.beginPath();
      ctx.moveTo(x, grid.y);
      ctx.lineTo(x, grid.y + grid.h);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      const y = grid.y + grid.h * r / ROWS;
      ctx.beginPath();
      ctx.moveTo(grid.x, y);
      ctx.lineTo(grid.x + grid.w, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  els.emptyPreview.style.display = "none";
  if (els.emptyCutPreview) els.emptyCutPreview.style.display = "none";
  canvas.classList.add("visible");
}

async function recognizeBoard() {
  const image = state.image;
  const grid = state.grid;
  if (!image || !grid) return;
  const atlasEntries = recognitionAtlasEntries();
  const canvas = makeCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const cellW = grid.w / COLS;
  const cellH = grid.h / ROWS;
  if (state.embeddingModel) {
    await ensureAtlasEmbeddings(atlasEntries);
  }
  const cellResults = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const index = r * COLS + c;
      const rect = {
        x: grid.x + c * cellW,
        y: grid.y + r * cellH,
        w: cellW,
        h: cellH
      };
      if (isEmptyCell(ctx, rect)) {
        cellResults.push({ index, value: 0, confidence: 1, candidates: [] });
        continue;
      }
      const feature = featureFromCanvasRegion(ctx, rect, ANALYSIS_FEATURE_INSET);
      const pixelFeature = pixelFeatureFromCanvasRegion(ctx, rect, ANALYSIS_FEATURE_INSET);
      const iconFeature = iconFeatureFromCanvasRegion(ctx, rect, ANALYSIS_FEATURE_INSET);
      const colorFeature = colorFeatureFromCanvasRegion(ctx, rect, ANALYSIS_FEATURE_INSET);
      const embedding = state.embeddingModel ? await embeddingFromCanvasRegion(ctx, rect, ANALYSIS_FEATURE_INSET) : null;
      const candidates = rankAtlasMatches({ feature, pixelFeature, iconFeature, colorFeature, embedding }, atlasEntries);
      const match = firstAcceptedAtlasMatch(candidates);
      if (match) {
        cellResults.push({
          index,
          value: match.id,
          confidence: Math.max(0, 1 - match.distance / DEFAULT_THRESHOLD),
          candidates,
          sampleFeature: feature,
          samplePixelFeature: pixelFeature,
          sampleIconFeature: iconFeature,
          sampleColorFeature: colorFeature
        });
      } else {
        cellResults.push({
          index,
          value: 1_000_000 + index,
          confidence: 0,
          candidates,
          sampleFeature: feature,
          samplePixelFeature: pixelFeature,
          sampleIconFeature: iconFeature,
          sampleColorFeature: colorFeature
        });
      }
    }
  }
  applyTileCountLimit(cellResults);
  state.board = cellResults.map(result => result.value);
  state.confidence = cellResults.map(result => result.confidence);
  state.debugCellResults = cellResults.map(result => ({
    index: result.index,
    value: result.value,
    confidence: result.confidence,
    candidates: result.candidates?.slice(0, MATCH_CANDIDATE_LIMIT).map(candidate => ({
      id: candidate.id,
      distance: candidate.distance,
      fingerprintDistance: candidate.fingerprintDistance,
      pixelDistance: candidate.pixelDistance,
      iconDistance: candidate.iconDistance,
      colorDistance: candidate.colorDistance,
      embeddingDistance: candidate.embeddingDistance,
      name: candidate.entry?.name
    })) || []
  }));
}

function isEmptyCell(ctx, rect) {
  const sourceX = Math.max(0, Math.floor(rect.x + rect.w * 0.10));
  const sourceY = Math.max(0, Math.floor(rect.y + rect.h * 0.10));
  const sourceW = Math.max(1, Math.floor(rect.w * 0.80));
  const sourceH = Math.max(1, Math.floor(rect.h * 0.80));
  const sampleSize = 16;
  const canvas = makeCanvas(sampleSize, sampleSize);
  const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = "high";
  sampleCtx.drawImage(ctx.canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, sampleSize, sampleSize);
  const image = sampleCtx.getImageData(0, 0, sampleSize, sampleSize);
  const redValues = [];
  const greenValues = [];
  const blueValues = [];
  const luminance = [];
  let brown = 0;
  let lightTile = 0;
  let saturatedNonBrown = 0;
  const total = image.data.length / 4;
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isBrownBoardPixel = r >= 95 && r <= 190 && g >= 45 && g <= 135 && b <= 80 && r > g + 18;
    const isLightTileFacePixel = r >= 185 && g >= 195 && b >= 135;
    if (isBrownBoardPixel) {
      brown++;
    } else if (max - min > 55) {
      saturatedNonBrown++;
    }
    if (isLightTileFacePixel) lightTile++;
    redValues.push(r);
    greenValues.push(g);
    blueValues.push(b);
    luminance.push(r * 0.299 + g * 0.587 + b * 0.114);
  }
  const redMean = average(redValues);
  const greenMean = average(greenValues);
  const blueMean = average(blueValues);
  const colorStd = (
    standardDeviation(redValues, redMean) +
    standardDeviation(greenValues, greenMean) +
    standardDeviation(blueValues, blueMean)
  ) / 3;
  let edge = 0;
  let edgeCount = 0;
  for (let row = 0; row < sampleSize; row++) {
    for (let col = 0; col < sampleSize; col++) {
      const value = luminance[row * sampleSize + col];
      if (col + 1 < sampleSize) {
        edge += Math.abs(value - luminance[row * sampleSize + col + 1]);
        edgeCount++;
      }
      if (row + 1 < sampleSize) {
        edge += Math.abs(value - luminance[(row + 1) * sampleSize + col]);
        edgeCount++;
      }
    }
  }
  const edgeMean = edge / Math.max(1, edgeCount);
  const brownRatio = brown / total;
  const lightTileRatio = lightTile / total;
  const saturatedNonBrownRatio = saturatedNonBrown / total;
  const solidBrownGap = redMean >= 125 && redMean <= 175 &&
    greenMean >= 70 && greenMean <= 115 &&
    blueMean >= 10 && blueMean <= 50 &&
    colorStd < 8 &&
    edgeMean < 2;
  const mostlyBrownGapWithShadow = brownRatio > 0.55 &&
    lightTileRatio < 0.18 &&
    saturatedNonBrownRatio < 0.22 &&
    edgeMean < 18;
  return solidBrownGap || mostlyBrownGapWithShadow;
}

function matchAtlas(sample, entries = state.atlas) {
  return firstAcceptedAtlasMatch(rankAtlasMatches(sample, entries));
}

function rankAtlasMatches(sample, entries = state.atlas) {
  const feature = Array.isArray(sample) ? sample : sample.feature;
  const pixelFeature = Array.isArray(sample) ? null : sample.pixelFeature;
  const iconFeature = Array.isArray(sample) ? null : sample.iconFeature;
  const colorFeature = Array.isArray(sample) ? null : sample.colorFeature;
  const embedding = Array.isArray(sample) ? null : sample.embedding;
  const matches = [];
  for (const entry of entries) {
    if (!entry.feature || entry.feature.length !== feature.length) continue;
    const fingerprintDistance = rms(feature, entry.feature);
    const pixelDistance = pixelFeature && entry.pixelFeature && entry.pixelFeature.length === pixelFeature.length
      ? rms(pixelFeature, entry.pixelFeature)
      : fingerprintDistance;
    const iconDistance = iconFeature && entry.iconFeature && entry.iconFeature.length === iconFeature.length
      ? rms(iconFeature, entry.iconFeature)
      : null;
    const colorDistance = colorFeature && entry.colorFeature && entry.colorFeature.length === colorFeature.length
      ? rms(colorFeature, entry.colorFeature)
      : null;
    const fallbackDistance = iconDistance == null
      ? fingerprintDistance * 0.42 + pixelDistance * 0.38 + (colorDistance ?? fingerprintDistance) * 0.20
      : pixelDistance * 0.42 + fingerprintDistance * 0.24 + iconDistance * 0.24 + (colorDistance ?? iconDistance) * 0.10;
    const embeddingDistance = embedding && entry.embedding ? cosineDistance(embedding, entry.embedding) : null;
    const distance = embeddingDistance == null ? fallbackDistance : Math.min(1, fallbackDistance) * 0.90 + embeddingDistance * 0.10;
    matches.push({ id: entry.id, entry, distance, fingerprintDistance, pixelDistance, iconDistance, colorDistance, embeddingDistance });
  }
  return matches.sort((a, b) => a.distance - b.distance).slice(0, MATCH_CANDIDATE_LIMIT);
}

function firstAcceptedAtlasMatch(matches) {
  const best = matches[0];
  const second = matches[1];
  if (!best) return null;
  if (best.embeddingDistance != null) {
    if (best.embeddingDistance > MODEL_DISTANCE_THRESHOLD && best.distance > DEFAULT_THRESHOLD) return null;
    return best;
  }
  if (best.distance > DEFAULT_THRESHOLD) return null;
  if (second) {
    const gap = second.distance - best.distance;
    const ratio = best.distance / Math.max(second.distance, 0.0001);
    const strongAbsoluteMatch = best.distance <= 0.29 ||
      (best.iconDistance != null && best.iconDistance <= 0.31 && best.pixelDistance <= 0.38 && (best.colorDistance == null || best.colorDistance <= COLOR_MISMATCH_DISTANCE));
    if (best.colorDistance != null && best.colorDistance > COLOR_MISMATCH_DISTANCE && best.distance > 0.30) return null;
    if (!strongAbsoluteMatch && best.distance > 0.34 && (gap < 0.012 || ratio > 0.975)) return null;
  } else if (best.distance > Math.min(0.22, DEFAULT_THRESHOLD)) {
    return null;
  }
  return best;
}

function applyTileCountLimit(cellResults) {
  const counts = tileCounts(cellResults);
  let changed = true;
  for (let pass = 0; pass < 8 && changed; pass++) {
    changed = false;

    changed = repairSingletonTriplePairs(cellResults, counts) || changed;

    for (const [tileID, count] of Array.from(counts.entries())) {
      if (count <= MAX_SAME_TILE_COUNT) continue;
      const overflow = count - MAX_SAME_TILE_COUNT;
      const assigned = assignedResultsForTile(cellResults, tileID);
      for (const result of assigned.slice(0, overflow)) {
        changed = reassignOrUnknown(result, tileID, counts) || changed;
      }
    }

    for (const [tileID, count] of Array.from(counts.entries())) {
      if (count <= 0 || VALID_TILE_COUNTS.has(count)) continue;
      const removeCount = count % 2 === 1 ? 1 : Math.max(0, count - MAX_SAME_TILE_COUNT);
      const assigned = assignedResultsForTile(cellResults, tileID);
      for (const result of assigned.slice(0, removeCount)) {
        changed = reassignOrUnknown(result, tileID, counts) || changed;
      }
    }

    for (const [tileID, count] of Array.from(counts.entries())) {
      if (count !== MAX_SAME_TILE_COUNT) continue;
      const assigned = assignedResultsForTile(cellResults, tileID);
      if (!looksLikeMixedQuartet(assigned, tileID)) continue;
      for (const result of assigned.slice(0, 2)) {
        changed = reassignOrUnknown(result, tileID, counts) || changed;
      }
    }
  }
}

function repairSingletonTriplePairs(cellResults, counts) {
  let changed = false;
  const singleIDs = Array.from(counts.entries())
    .filter(([, count]) => count === 1)
    .map(([tileID]) => tileID);
  const tripleIDs = Array.from(counts.entries())
    .filter(([, count]) => count === 3)
    .map(([tileID]) => tileID);
  if (!singleIDs.length || !tripleIDs.length) return false;

  for (const singleID of singleIDs) {
    if ((counts.get(singleID) || 0) !== 1) continue;
    const result = cellResults.find(item => item.value === singleID);
    if (!result?.candidates?.length) continue;

    const current = result.candidates.find(candidate => candidate.id === singleID);
    const currentDistance = current?.distance ?? currentTileDistance(result, singleID);
    let best = null;

    for (const tripleID of tripleIDs) {
      if ((counts.get(tripleID) || 0) !== 3) continue;
      const candidate = result.candidates.find(item => item.id === tripleID);
      if (!candidate) continue;
      const absoluteLimit = Math.max(DEFAULT_THRESHOLD, currentDistance + 0.18);
      const isCloseEnough = candidate.distance <= absoluteLimit &&
        (candidate.colorDistance == null || candidate.colorDistance <= COLOR_MISMATCH_DISTANCE + 0.12);
      if (!isCloseEnough) continue;

      const score = candidate.distance + Math.max(0, candidate.distance - currentDistance) * 0.35;
      if (!best || score < best.score) {
        best = { candidate, tripleID, score };
      }
    }

    if (!best) continue;
    result.value = best.tripleID;
    result.confidence = Math.max(0, 1 - best.candidate.distance / DEFAULT_THRESHOLD);
    counts.set(singleID, 0);
    counts.set(best.tripleID, 4);
    changed = true;
  }

  return changed;
}

function assignedResultsForTile(cellResults, tileID) {
  return cellResults
    .filter(result => result.value === tileID)
    .sort((a, b) => currentTileDistance(b, tileID) - currentTileDistance(a, tileID));
}

function currentTileDistance(result, tileID) {
  return result.candidates?.find(candidate => candidate.id === tileID)?.distance ?? 1;
}

function reassignOrUnknown(result, oldTileID, counts) {
  const replacement = result.candidates.find(candidate => {
    if (candidate.id === oldTileID) return false;
    if ((counts.get(candidate.id) || 0) >= MAX_SAME_TILE_COUNT) return false;
    if (candidate.distance > DEFAULT_THRESHOLD) return false;
    const current = result.candidates.find(item => item.id === oldTileID);
    return !current || candidate.distance <= current.distance + 0.14;
  });
  counts.set(oldTileID, Math.max(0, (counts.get(oldTileID) || 1) - 1));
  if (replacement) {
    result.value = replacement.id;
    result.confidence = Math.max(0, 1 - replacement.distance / DEFAULT_THRESHOLD);
    counts.set(replacement.id, (counts.get(replacement.id) || 0) + 1);
  } else {
    result.value = 1_000_000 + result.index;
    result.confidence = 0;
  }
  return true;
}

function looksLikeMixedQuartet(assigned, tileID) {
  if (assigned.length !== MAX_SAME_TILE_COUNT) return false;
  const sorted = [...assigned].sort((a, b) => currentTileDistance(a, tileID) - currentTileDistance(b, tileID));
  const distances = sorted.map(result => currentTileDistance(result, tileID));
  const weakTail = distances[2] > WEAK_MATCH_DISTANCE && distances[3] > WEAK_MATCH_DISTANCE;
  const clearDistanceJump = distances[2] - distances[1] > WEAK_QUARTET_DISTANCE_GAP;
  if (weakTail && clearDistanceJump) return true;

  const head = sorted.slice(0, 2);
  const tail = sorted.slice(2);
  const headDistance = averagePairDistance(head);
  const tailDistance = averagePairDistance(tail);
  const crossDistance = averageCrossDistance(head, tail);
  return distances[2] > WEAK_MATCH_DISTANCE &&
    headDistance < 0.25 &&
    tailDistance < 0.25 &&
    crossDistance > Math.max(headDistance, tailDistance) + 0.12;
}

function averagePairDistance(results) {
  if (results.length < 2) return 0;
  return sampleDistance(results[0], results[1]);
}

function averageCrossDistance(left, right) {
  const values = [];
  for (const a of left) {
    for (const b of right) {
      values.push(sampleDistance(a, b));
    }
  }
  return average(values);
}

function sampleDistance(a, b) {
  if (a.sampleColorFeature && b.sampleColorFeature && a.sampleIconFeature && b.sampleIconFeature) {
    return rms(a.sampleIconFeature, b.sampleIconFeature) * 0.55 + rms(a.sampleColorFeature, b.sampleColorFeature) * 0.45;
  }
  if (a.sampleIconFeature && b.sampleIconFeature) return rms(a.sampleIconFeature, b.sampleIconFeature);
  if (a.sampleColorFeature && b.sampleColorFeature) return rms(a.sampleColorFeature, b.sampleColorFeature);
  if (a.samplePixelFeature && b.samplePixelFeature) return rms(a.samplePixelFeature, b.samplePixelFeature);
  if (a.sampleFeature && b.sampleFeature) return rms(a.sampleFeature, b.sampleFeature);
  return 0;
}

function tileCounts(cellResults) {
  const counts = new Map();
  for (const result of cellResults) {
    if (result.value <= 0 || result.value >= 1_000_000) continue;
    counts.set(result.value, (counts.get(result.value) || 0) + 1);
  }
  return counts;
}

function featureFromImage(image) {
  const canvas = makeCanvas(image.naturalWidth || image.width || 96, image.naturalHeight || image.height || 96);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return featureFromCanvasRegion(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, 0);
}

function pixelFeatureFromImage(image) {
  const canvas = makeCanvas(image.naturalWidth || image.width || 96, image.naturalHeight || image.height || 96);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return pixelFeatureFromCanvasRegion(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, 0);
}

function iconFeatureFromImage(image) {
  const canvas = makeCanvas(image.naturalWidth || image.width || 96, image.naturalHeight || image.height || 96);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return iconFeatureFromCanvasRegion(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, 0);
}

function colorFeatureFromImage(image) {
  const canvas = makeCanvas(image.naturalWidth || image.width || 96, image.naturalHeight || image.height || 96);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return colorFeatureFromCanvasRegion(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, 0);
}

function pixelFeatureFromCanvasRegion(ctx, rect, insetRatio = 0) {
  const size = 16;
  const insetX = rect.w * insetRatio;
  const insetY = rect.h * insetRatio;
  const sourceX = Math.max(0, Math.floor(rect.x + insetX));
  const sourceY = Math.max(0, Math.floor(rect.y + insetY));
  const sourceW = Math.max(1, Math.floor(rect.w - insetX * 2));
  const sourceH = Math.max(1, Math.floor(rect.h - insetY * 2));
  const canvas = makeCanvas(size, size);
  const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = "high";
  sampleCtx.drawImage(ctx.canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, size, size);
  const image = sampleCtx.getImageData(0, 0, size, size);
  const features = [];
  const luminance = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const edgeWeight = x === 0 || y === 0 || x === size - 1 || y === size - 1 ? 0.45 : 1;
      const r = image.data[i] / 255;
      const g = image.data[i + 1] / 255;
      const b = image.data[i + 2] / 255;
      luminance.push(r * 0.299 + g * 0.587 + b * 0.114);
      features.push(r * edgeWeight, g * edgeWeight, b * edgeWeight);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const center = luminance[y * size + x];
      const right = x + 1 < size ? luminance[y * size + x + 1] : center;
      const down = y + 1 < size ? luminance[(y + 1) * size + x] : center;
      features.push((Math.abs(center - right) + Math.abs(center - down)) * 0.35);
    }
  }
  return features;
}

function iconFeatureFromCanvasRegion(ctx, rect, insetRatio = 0) {
  const cropSize = 64;
  const featureSize = 24;
  const insetX = rect.w * insetRatio;
  const insetY = rect.h * insetRatio;
  const sourceX = Math.max(0, Math.floor(rect.x + insetX));
  const sourceY = Math.max(0, Math.floor(rect.y + insetY));
  const sourceW = Math.max(1, Math.floor(rect.w - insetX * 2));
  const sourceH = Math.max(1, Math.floor(rect.h - insetY * 2));
  const crop = makeCanvas(cropSize, cropSize);
  const cropCtx = crop.getContext("2d", { willReadFrequently: true });
  cropCtx.imageSmoothingEnabled = true;
  cropCtx.imageSmoothingQuality = "high";
  cropCtx.drawImage(ctx.canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, cropSize, cropSize);
  const cropImage = cropCtx.getImageData(0, 0, cropSize, cropSize);

  let minX = cropSize, minY = cropSize, maxX = -1, maxY = -1, hits = 0;
  for (let y = 0; y < cropSize; y++) {
    for (let x = 0; x < cropSize; x++) {
      const i = (y * cropSize + x) * 4;
      if (!isIconForegroundPixel(cropImage.data[i], cropImage.data[i + 1], cropImage.data[i + 2])) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      hits++;
    }
  }

  let boxX = Math.round(cropSize * 0.14);
  let boxY = Math.round(cropSize * 0.12);
  let boxW = Math.round(cropSize * 0.72);
  let boxH = Math.round(cropSize * 0.76);
  if (hits > cropSize * cropSize * 0.025 && maxX > minX && maxY > minY) {
    const pad = 4;
    boxX = Math.max(0, minX - pad);
    boxY = Math.max(0, minY - pad);
    boxW = Math.min(cropSize - boxX, maxX - minX + 1 + pad * 2);
    boxH = Math.min(cropSize - boxY, maxY - minY + 1 + pad * 2);
    const side = Math.max(boxW, boxH);
    boxX = Math.max(0, Math.min(cropSize - side, boxX - (side - boxW) / 2));
    boxY = Math.max(0, Math.min(cropSize - side, boxY - (side - boxH) / 2));
    boxW = Math.min(side, cropSize - boxX);
    boxH = Math.min(side, cropSize - boxY);
  }

  const sample = makeCanvas(featureSize, featureSize);
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = "high";
  sampleCtx.fillStyle = "#eef8c8";
  sampleCtx.fillRect(0, 0, featureSize, featureSize);
  sampleCtx.drawImage(crop, boxX, boxY, boxW, boxH, 0, 0, featureSize, featureSize);
  const image = sampleCtx.getImageData(0, 0, featureSize, featureSize);
  const features = [];
  const mask = [];
  const luminance = [];
  for (let y = 0; y < featureSize; y++) {
    for (let x = 0; x < featureSize; x++) {
      const i = (y * featureSize + x) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      const foreground = isIconForegroundPixel(r, g, b) ? 1 : 0;
      mask.push(foreground);
      luminance.push((r * 0.299 + g * 0.587 + b * 0.114) / 255);
      features.push((r / 255) * foreground, (g / 255) * foreground, (b / 255) * foreground, foreground);
    }
  }
  for (let y = 0; y < featureSize; y++) {
    for (let x = 0; x < featureSize; x++) {
      const center = luminance[y * featureSize + x] * mask[y * featureSize + x];
      const rightIndex = y * featureSize + Math.min(featureSize - 1, x + 1);
      const downIndex = Math.min(featureSize - 1, y + 1) * featureSize + x;
      const right = luminance[rightIndex] * mask[rightIndex];
      const down = luminance[downIndex] * mask[downIndex];
      features.push(Math.abs(center - right) * 0.45 + Math.abs(center - down) * 0.45);
    }
  }
  return features;
}

function colorFeatureFromCanvasRegion(ctx, rect, insetRatio = 0) {
  const size = 48;
  const hueBins = 18;
  const insetX = rect.w * insetRatio;
  const insetY = rect.h * insetRatio;
  const sourceX = Math.max(0, Math.floor(rect.x + insetX));
  const sourceY = Math.max(0, Math.floor(rect.y + insetY));
  const sourceW = Math.max(1, Math.floor(rect.w - insetX * 2));
  const sourceH = Math.max(1, Math.floor(rect.h - insetY * 2));
  const canvas = makeCanvas(size, size);
  const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = "high";
  sampleCtx.drawImage(ctx.canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, size, size);
  const image = sampleCtx.getImageData(0, 0, size, size);
  const hueHistogram = Array(hueBins).fill(0);
  const saturationBands = Array(4).fill(0);
  const valueBands = Array(4).fill(0);
  let count = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  let saturationSum = 0;
  let valueSum = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    if (!isIconForegroundPixel(r, g, b)) continue;
    const [h, s, v] = rgbToHsv(r, g, b);
    const weight = 0.35 + s * 0.65;
    hueHistogram[Math.min(hueBins - 1, Math.floor(h * hueBins))] += weight;
    saturationBands[Math.min(3, Math.floor(s * 4))] += weight;
    valueBands[Math.min(3, Math.floor(v * 4))] += weight;
    red += r / 255;
    green += g / 255;
    blue += b / 255;
    saturationSum += s;
    valueSum += v;
    count++;
  }

  const total = Math.max(1, hueHistogram.reduce((sum, value) => sum + value, 0));
  const pixelTotal = Math.max(1, count);
  return [
    ...hueHistogram.map(value => value / total * 3),
    ...saturationBands.map(value => value / total * 1.5),
    ...valueBands.map(value => value / total * 1.2),
    red / pixelTotal,
    green / pixelTotal,
    blue / pixelTotal,
    saturationSum / pixelTotal,
    valueSum / pixelTotal,
    Math.min(1, count / (size * size * 0.55))
  ];
}

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : delta / max;
  return [h, s, max];
}

function isIconForegroundPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max - min;
  const tileFace = r >= 178 && g >= 188 && b >= 125 && g >= r - 34 && g >= b + 4;
  const paleWhite = r >= 218 && g >= 218 && b >= 205 && saturation <= 34;
  const darkGrid = isGridLine(r, g, b) || isAtlasTileFrame(r, g, b);
  const softShadow = saturation <= 18 && max < 210;
  if (tileFace || paleWhite || darkGrid || softShadow) return false;
  return saturation > 26 || max < 150 || r < 168 || g < 168 || b < 168;
}

async function ensureAtlasEmbeddings(entries) {
  if (!state.embeddingModel) return;
  for (const entry of entries) {
    if (!entry.embedding && entry.image) {
      entry.embedding = await embeddingFromImage(entry.image);
    }
  }
}

async function embeddingFromImage(image) {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return embeddingFromCanvas(canvas);
}

async function embeddingFromCanvasRegion(ctx, rect, insetRatio = 0) {
  const insetX = rect.w * insetRatio;
  const insetY = rect.h * insetRatio;
  const sourceX = Math.max(0, Math.floor(rect.x + insetX));
  const sourceY = Math.max(0, Math.floor(rect.y + insetY));
  const sourceW = Math.max(1, Math.floor(rect.w - insetX * 2));
  const sourceH = Math.max(1, Math.floor(rect.h - insetY * 2));
  const canvas = makeCanvas(128, 128);
  const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = "high";
  sampleCtx.drawImage(ctx.canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
  return embeddingFromCanvas(canvas);
}

async function embeddingFromCanvas(canvas) {
  if (!state.embeddingModel) return null;
  const tensor = state.embeddingModel.infer(canvas, true);
  const values = Array.from(await tensor.data());
  tensor.dispose?.();
  return normalizeVector(values);
}

function normalizeVector(values) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map(value => value / norm);
}

function featureFromCanvasRegion(ctx, rect, insetRatio = 0) {
  const size = 12;
  const insetX = rect.w * insetRatio;
  const insetY = rect.h * insetRatio;
  const sourceX = Math.max(0, Math.floor(rect.x + insetX));
  const sourceY = Math.max(0, Math.floor(rect.y + insetY));
  const sourceW = Math.max(1, Math.floor(rect.w - insetX * 2));
  const sourceH = Math.max(1, Math.floor(rect.h - insetY * 2));
  const canvas = makeCanvas(size, size);
  const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = "high";
  sampleCtx.drawImage(ctx.canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, size, size);
  const image = sampleCtx.getImageData(0, 0, size, size);
  const features = [];
  const pixelCount = size * size;
  const luminance = [];
  const redValues = [];
  const greenValues = [];
  const blueValues = [];

  for (let index = 0; index < pixelCount; index++) {
    const offset = index * 4;
    const red = image.data[offset] / 255;
    const green = image.data[offset + 1] / 255;
    const blue = image.data[offset + 2] / 255;
    redValues.push(red);
    greenValues.push(green);
    blueValues.push(blue);
    luminance.push(red * 0.299 + green * 0.587 + blue * 0.114);
  }

  const lumaMean = average(luminance);
  const lumaStd = Math.max(standardDeviation(luminance, lumaMean), 0.05);
  const cornerIndices = [0, size - 1, (size - 1) * size, pixelCount - 1];
  const backgroundRed = average(cornerIndices.map(index => redValues[index]));
  const backgroundGreen = average(cornerIndices.map(index => greenValues[index]));
  const backgroundBlue = average(cornerIndices.map(index => blueValues[index]));

  for (let index = 0; index < pixelCount; index++) {
    features.push(((luminance[index] - lumaMean) / lumaStd) * 0.35);
    features.push(redValues[index] * 0.25);
    features.push(greenValues[index] * 0.25);
    features.push(blueValues[index] * 0.25);
  }

  const foregroundMask = Array(pixelCount).fill(0);
  for (let index = 0; index < pixelCount; index++) {
    const redDelta = redValues[index] - backgroundRed;
    const greenDelta = greenValues[index] - backgroundGreen;
    const blueDelta = blueValues[index] - backgroundBlue;
    const colorDistance = Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
    const foreground = Math.min(1, Math.max(0, (colorDistance - 0.07) / 0.22));
    foregroundMask[index] = foreground;
    features.push(foreground * 1.05);
    features.push(redDelta * foreground * 0.85);
    features.push(greenDelta * foreground * 0.85);
    features.push(blueDelta * foreground * 0.85);
  }

  const foregroundIndices = foregroundMask
    .map((value, index) => (value > 0.20 ? index : -1))
    .filter(index => index >= 0);
  if (foregroundIndices.length) {
    const rows = foregroundIndices.map(index => Math.floor(index / size));
    const cols = foregroundIndices.map(index => index % size);
    const minRow = Math.max(0, Math.min(...rows) - 1);
    const maxRow = Math.min(size - 1, Math.max(...rows) + 1);
    const minCol = Math.max(0, Math.min(...cols) - 1);
    const maxCol = Math.min(size - 1, Math.max(...cols) + 1);
    const boxHeight = Math.max(1, maxRow - minRow + 1);
    const boxWidth = Math.max(1, maxCol - minCol + 1);

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const sourceRow = minRow + Math.min(boxHeight - 1, Math.floor((row + 0.5) * boxHeight / size));
        const sourceCol = minCol + Math.min(boxWidth - 1, Math.floor((col + 0.5) * boxWidth / size));
        const sourceIndex = sourceRow * size + sourceCol;
        const foreground = foregroundMask[sourceIndex];
        features.push(foreground * 1.35);
        features.push((redValues[sourceIndex] - backgroundRed) * foreground * 1.15);
        features.push((greenValues[sourceIndex] - backgroundGreen) * foreground * 1.15);
        features.push((blueValues[sourceIndex] - backgroundBlue) * foreground * 1.15);
        features.push(((luminance[sourceIndex] - lumaMean) / lumaStd) * foreground * 0.45);
      }
    }
  } else {
    features.push(...Array(pixelCount * 5).fill(0));
  }

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const center = luminance[row * size + col];
      const right = col + 1 < size ? luminance[row * size + col + 1] : center;
      const down = row + 1 < size ? luminance[(row + 1) * size + col] : center;
      features.push((Math.abs(center - right) + Math.abs(center - down)) * 0.70);
    }
  }

  features.push(...colorHistogram(redValues, 8));
  features.push(...colorHistogram(greenValues, 8));
  features.push(...colorHistogram(blueValues, 8));
  return features;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values, mean = average(values)) {
  const variance = values.reduce((sum, value) => {
    const delta = value - mean;
    return sum + delta * delta;
  }, 0) / Math.max(1, values.length);
  return Math.sqrt(variance);
}

function colorHistogram(values, bins) {
  const histogram = Array(bins).fill(0);
  for (const value of values) {
    const index = Math.min(bins - 1, Math.max(0, Math.floor(value * bins)));
    histogram[index] += 1;
  }
  return histogram.map(value => value / Math.max(1, values.length));
}

function renderBoard(container, board, options = {}) {
  container.innerHTML = "";
  const template = $("#cellTemplate");
  for (let i = 0; i < CELL_COUNT; i++) {
    const value = board[i] || 0;
    const cell = template.content.firstElementChild.cloneNode(true);
    if (value === 0) {
      cell.classList.add("empty");
      cell.disabled = !options.editable;
    } else {
      const entry = atlasById(value);
      if (entry) {
        const image = document.createElement("img");
        image.src = entry.imageData;
        image.alt = entry.name;
        cell.appendChild(image);
      } else {
        cell.innerHTML = `<span class="unknown">?</span>`;
      }
    }
    if (options.highlights?.has(i)) {
      cell.classList.add("highlight");
    }
    if (options.editable) {
      cell.addEventListener("click", () => openCorrectionPicker(i));
    }
    container.appendChild(cell);
  }
}

function openCorrectionPicker(index) {
  const entries = recognitionAtlasEntries();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop correction-picker";
  backdrop.innerHTML = `
    <section class="modal-card correction-card">
      <header class="modal-header">
        <button class="soft-button close-picker" type="button">取消</button>
        <h3>校正格子 R${Math.floor(index / COLS) + 1}C${index % COLS + 1}</h3>
        <button class="soft-button empty-picker" type="button">设为空格</button>
      </header>
      <div class="picker-grid"></div>
    </section>
  `;
  const grid = backdrop.querySelector(".picker-grid");
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "picker-tile";
    button.innerHTML = `<img src="${entry.imageData}" alt=""><span>${escapeHtml(entry.name)}</span>`;
    button.addEventListener("click", () => {
      state.board[index] = entry.id;
      closeCorrectionPicker(backdrop);
    });
    grid.appendChild(button);
  }
  backdrop.querySelector(".close-picker").addEventListener("click", () => closeCorrectionPicker(backdrop));
  backdrop.querySelector(".empty-picker").addEventListener("click", () => {
    state.board[index] = 0;
    closeCorrectionPicker(backdrop);
  });
  document.body.appendChild(backdrop);
  document.body.classList.add("modal-open");
}

function closeCorrectionPicker(backdrop) {
  backdrop.remove();
  els.tileCountBadge.textContent = `${tileCount(state.board)} 块`;
  els.solveButton.disabled = tileCount(state.board) === 0;
  renderBoard(els.correctionBoard, state.board, { editable: true });
  if (![els.categoryModal, els.importReviewModal, els.tileMenuModal].some(item => item && !item.hidden)) {
    document.body.classList.remove("modal-open");
  }
}

function solveCurrentBoard() {
  const started = performance.now();
  const solver = new Solver(60_000);
  const result = solver.solve(state.board);
  state.steps = result.steps;
  state.stepBoards = [state.board];
  let cursor = state.board;
  for (const move of state.steps) {
    cursor = applyMove(cursor, move) || cursor;
    state.stepBoards.push(cursor);
  }
  state.stepIndex = 0;
  setStatus(result.solved ? "找到通关步骤" : "已返回最多步骤", `步骤 ${state.steps.length}，用时 ${((performance.now() - started) / 1000).toFixed(1)} 秒。`);
  els.resultTitle.textContent = result.solved ? "通关步骤" : "最多可走步骤";
  els.resultSubtitle.textContent = result.solved
    ? "已找到完整通关路径。"
    : "已返回当前最好方案，剩余仍可能继续消除。";
  els.resultReason.textContent = result.solved
    ? "已找到完整通关方案。"
    : "已返回当前最好方案；剩余仍可能继续消除。";
  showResult(true);
  renderStep();
  syncAutoNext();
}

function renderStep() {
  const total = state.steps.length;
  els.stepCounter.textContent = total ? `${Math.min(state.stepIndex + 1, total)}/${total}` : "0/0";
  if (!total) {
    els.stepTitle.textContent = "还没有步骤";
    els.stepDescription.textContent = "完成识别后点击开始分析。";
    els.stepCounter.textContent = "0/0";
    renderBoard(els.stepBoard, state.board);
    return;
  }
  const move = state.steps[Math.min(state.stepIndex, total - 1)];
  els.stepTitle.textContent = move.type === "remove" ? "直接点掉两块" : `向${directionLabel(move.direction)}拖 ${move.distance} 格`;
  els.stepDescription.textContent = describeMove(move);
  const board = state.stepBoards[state.stepIndex] || state.board;
  renderBoard(els.stepBoard, board, { highlights: highlightedIndexes(move) });
}

function highlightedIndexes(move) {
  const set = new Set();
  if (move.type === "remove") {
    set.add(idx(move.a.row, move.a.col));
    set.add(idx(move.b.row, move.b.col));
  } else {
    set.add(idx(move.start.row, move.start.col));
    set.add(idx(move.target.row, move.target.col));
  }
  return set;
}

function describeMove(move) {
  if (move.type === "remove") {
    return `高亮的两个格子：R${move.a.row + 1}C${move.a.col + 1} 和 R${move.b.row + 1}C${move.b.col + 1}。`;
  }
  return `按住 R${move.start.row + 1}C${move.start.col + 1}，向${directionLabel(move.direction)}拖动，消除目标 R${move.target.row + 1}C${move.target.col + 1}。`;
}

window.__brickkingDebug = () => ({
  board: state.board.slice(),
  cellResults: state.debugCellResults,
  steps: state.steps.slice(),
  stepBoards: state.stepBoards.map(board => board.slice()),
  atlas: state.atlas.map(entry => ({ id: entry.id, name: entry.name, category: entry.category }))
});

function advanceStep() {
  if (!state.steps.length) return;
  state.stepIndex = Math.min(state.steps.length - 1, state.stepIndex + 1);
  renderStep();
}

function syncAutoNext() {
  if (state.autoTimer) {
    clearInterval(state.autoTimer);
    state.autoTimer = null;
  }
  if (!els.autoNextToggle.checked || !state.steps.length) return;
  const seconds = clamp(Number(els.autoNextSeconds.value) || 3, 1, 20);
  state.autoTimer = setInterval(() => {
    if (state.autoPaused) return;
    if (state.stepIndex >= state.steps.length - 1) {
      clearInterval(state.autoTimer);
      state.autoTimer = null;
      return;
    }
    advanceStep();
  }, seconds * 1000);
}

class SearchCache {
  constructor() {
    this.legal = new Map();
    this.direct = new Map();
    this.tileCounts = new Map();
  }

  legalMoves(board) {
    const key = boardKey(board);
    if (!this.legal.has(key)) this.legal.set(key, legalMoves(board));
    return this.legal.get(key);
  }

  directMoves(board) {
    const key = boardKey(board);
    if (!this.direct.has(key)) this.direct.set(key, directMoves(board));
    return this.direct.get(key);
  }

  tileCount(board) {
    const key = boardKey(board);
    if (!this.tileCounts.has(key)) this.tileCounts.set(key, tileCount(board));
    return this.tileCounts.get(key);
  }
}

class Solver {
  constructor(timeLimitMs = 30_000) {
    this.deadline = performance.now() + timeLimitMs;
    this.cache = new SearchCache();
  }

  solve(initial) {
    const strategies = ["balanced", "dragEarly", "directFirst", "mobility", "lowBranch", "shortDrag", "longDrag"];
    let best = { steps: [], board: initial, solved: false };

    for (const strategy of strategies) {
      const run = this.solveGreedy(initial, strategy, { depth: 3, branch: 10 });
      best = betterResult(run, best);
      if (best.solved || performance.now() > this.deadline) return best;
    }

    const seed = this.solveSeedBeam(initial);
    best = betterResult(seed, best);
    if (best.solved || performance.now() > this.deadline) return best;

    const repairedSeed = this.repairFromPrefix(initial, best);
    best = betterResult(repairedSeed, best);
    if (best.solved || performance.now() > this.deadline) return best;

    const beam = this.solveBeam(initial, best);
    best = repairTail(betterResult(beam, best), this.cache);
    best = betterResult(this.repairFromPrefix(initial, best), best);
    return best;
  }

  solveGreedy(initial, strategy, options = {}) {
    let board = initial.slice();
    const visited = new Set([boardKey(board)]);
    const steps = [];
    const depth = options.depth || 2;
    const branch = options.branch || 8;

    while (performance.now() < this.deadline && this.cache.tileCount(board) > 0) {
      const candidates = rankedNextStates(board, strategy, steps.length + 1, this.cache)
        .filter(next => !visited.has(next.key));
      if (!candidates.length) break;

      const chosen = chooseLookahead(candidates, visited, strategy, steps.length + 1, depth, branch, this.cache, this.deadline);
      if (!chosen) break;
      steps.push(chosen.move);
      board = chosen.board;
      visited.add(chosen.key);
    }
    return { steps, board, solved: this.cache.tileCount(board) === 0 };
  }

  solveBeam(initial, seedBest) {
    const beamStrategies = ["balanced", "dragBiased", "directBiased", "mobility", "lowBranch", "endgame"];
    const initialKey = boardKey(initial);
    let best = seedBest || { steps: [], board: initial, solved: false };
    let frontier = beamStrategies.map(strategy => ({
      board: initial,
      key: initialKey,
      steps: [],
      strategy,
      lastMove: null,
      score: 0
    }));
    if (best.steps.length) {
      for (const strategy of beamStrategies) {
        frontier.push({
          board: best.board,
          key: boardKey(best.board),
          steps: best.steps,
          strategy,
          lastMove: best.steps[best.steps.length - 1] || null,
          score: nodeScore(best.board, best.steps, best.steps[best.steps.length - 1] || null, strategy, this.cache)
        });
      }
    }
    const seen = new Map([[initialKey, 0]]);
    const exhausted = new Set();

    while (frontier.length && performance.now() < this.deadline) {
      const nextFrontier = [];
      for (const node of frontier) {
        if (performance.now() > this.deadline) break;
        const remaining = this.cache.tileCount(node.board);
        if (remaining === 0) return { steps: node.steps, board: node.board, solved: true };
        if (node.steps.length > best.steps.length || remaining < this.cache.tileCount(best.board)) {
          best = { steps: node.steps, board: node.board, solved: false };
        }

        const endgame = this.solveEndgame(node, exhausted);
        if (endgame) return endgame;

        const candidates = rankedBeamCandidates(node, seen, this.cache)
          .slice(0, dynamicCandidateLimit(node.board, node.steps.length, this.cache));
        for (const candidate of candidates) {
          const nextSteps = node.steps.concat(candidate.move);
          const nextNode = {
            board: candidate.board,
            key: candidate.key,
            steps: nextSteps,
            strategy: node.strategy,
            lastMove: candidate.move,
            score: nodeScore(candidate.board, nextSteps, candidate.move, node.strategy, this.cache)
          };
          nextFrontier.push(nextNode);
        }
      }
      frontier = uniqueBestNodes(nextFrontier)
        .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
        .slice(0, dynamicBeamWidth(best.board, this.cache));
      for (const node of frontier) seen.set(node.key, node.steps.length);
    }
    return repairTail(best, this.cache);
  }

  solveSeedBeam(initial) {
    const strategies = ["balanced", "dragBiased", "directBiased", "mobility", "lowBranch", "endgame"];
    let best = { steps: [], board: initial, solved: false };

    for (const strategy of strategies) {
      if (performance.now() > this.deadline) break;
      let frontier = [{
        board: initial,
        key: boardKey(initial),
        steps: [],
        strategy,
        lastMove: null,
        score: 0
      }];
      const seen = new Map([[boardKey(initial), 0]]);

      while (frontier.length && performance.now() < this.deadline) {
        const nextFrontier = [];
        for (const node of frontier) {
          if (performance.now() > this.deadline) break;
          if (this.cache.tileCount(node.board) === 0) {
            return { steps: node.steps, board: node.board, solved: true };
          }
          const candidates = rankedBeamCandidates(node, seen, this.cache)
            .slice(0, dynamicCandidateLimit(node.board, node.steps.length, this.cache));
          for (const candidate of candidates) {
            const nextSteps = node.steps.concat(candidate.move);
            const nextNode = {
              board: candidate.board,
              key: candidate.key,
              steps: nextSteps,
              strategy,
              lastMove: candidate.move,
              score: nodeScore(candidate.board, nextSteps, candidate.move, strategy, this.cache)
            };
            best = betterResult({ steps: nextSteps, board: candidate.board, solved: this.cache.tileCount(candidate.board) === 0 }, best);
            if (best.solved) return best;
            nextFrontier.push(nextNode);
          }
        }
        frontier = uniqueBestNodes(nextFrontier)
          .sort((a, b) => b.score - a.score || this.cache.tileCount(a.board) - this.cache.tileCount(b.board) || b.steps.length - a.steps.length)
          .slice(0, dynamicSeedBeamWidth(best.board, this.cache));
        for (const node of frontier) seen.set(node.key, node.steps.length);
      }
    }

    return best;
  }

  repairFromPrefix(initial, seed) {
    if (!seed || seed.solved || seed.steps.length < 8 || performance.now() > this.deadline) return seed;
    let best = seed;
    const retreatCounts = [4, 6, 10, 14, 18, 24, 30];
    const strategies = ["balanced", "dragBiased", "directBiased", "mobility", "lowBranch", "endgame"];

    for (const retreat of retreatCounts) {
      if (performance.now() > this.deadline) break;
      const prefixLength = Math.max(0, seed.steps.length - retreat);
      const prefix = replayPrefix(initial, seed.steps, prefixLength);
      if (!prefix) continue;
      const blockedMove = seed.steps[prefixLength];

      for (const strategy of strategies) {
        if (performance.now() > this.deadline) break;
        let frontier = [{
          board: prefix.board,
          key: boardKey(prefix.board),
          steps: prefix.steps,
          strategy,
          lastMove: prefix.steps[prefix.steps.length - 1] || null,
          score: nodeScore(prefix.board, prefix.steps, prefix.steps[prefix.steps.length - 1] || null, strategy, this.cache)
        }];
        const seen = new Map(prefix.seen.map((key, index) => [key, index]));

        while (frontier.length && performance.now() < this.deadline) {
          const nextFrontier = [];
          for (const node of frontier) {
            if (performance.now() > this.deadline) break;
            if (this.cache.tileCount(node.board) === 0) {
              return { steps: node.steps, board: node.board, solved: true };
            }
            let candidates = rankedBeamCandidates(node, seen, this.cache)
              .slice(0, Math.max(24, dynamicCandidateLimit(node.board, node.steps.length, this.cache)));
            if (node.steps.length === prefixLength && blockedMove) {
              const blockedKey = JSON.stringify(blockedMove);
              candidates = candidates.filter(candidate => JSON.stringify(candidate.move) !== blockedKey);
            }
            for (const candidate of candidates) {
              const nextSteps = node.steps.concat(candidate.move);
              const solved = this.cache.tileCount(candidate.board) === 0;
              const candidateResult = { steps: nextSteps, board: candidate.board, solved };
              best = betterResult(candidateResult, best);
              if (solved) return candidateResult;

              const tail = this.solveEndgame({
                board: candidate.board,
                steps: nextSteps,
                strategy,
                lastMove: candidate.move
              }, new Set());
              if (tail?.solved) return tail;

              nextFrontier.push({
                board: candidate.board,
                key: candidate.key,
                steps: nextSteps,
                strategy,
                lastMove: candidate.move,
                score: nodeScore(candidate.board, nextSteps, candidate.move, strategy, this.cache)
              });
            }
          }
          frontier = uniqueBestNodes(nextFrontier)
            .sort((a, b) => b.score - a.score || this.cache.tileCount(a.board) - this.cache.tileCount(b.board) || b.steps.length - a.steps.length)
            .slice(0, dynamicSeedBeamWidth(best.board, this.cache));
          for (const node of frontier) seen.set(node.key, node.steps.length);
        }
      }
    }

    return best;
  }

  solveEndgame(node, exhausted) {
    const remaining = this.cache.tileCount(node.board);
    if (remaining > 28 || performance.now() > this.deadline) return null;
    const suffix = endgameDfs(node.board, this.cache, this.deadline, exhausted, 0, 18);
    if (!suffix) return null;
    const steps = node.steps.concat(suffix);
    let board = node.board;
    for (const move of suffix) board = applyMove(board, move);
    return { steps, board, solved: this.cache.tileCount(board) === 0 };
  }
}

function legalMoves(board) {
  return [...directMoves(board), ...dragMoves(board)];
}

function betterResult(a, b) {
  if (!b) return a;
  if (!a) return b;
  if (a.solved && !b.solved) return a;
  if (!a.solved && b.solved) return b;
  if (a.steps.length !== b.steps.length) return a.steps.length > b.steps.length ? a : b;
  return tileCount(a.board) < tileCount(b.board) ? a : b;
}

function rankedNextStates(board, strategy, stepNumber, cache) {
  return cache.legalMoves(board)
    .map(move => {
      const nextBoard = applyMove(board, move);
      if (!nextBoard) return null;
      return { move, board: nextBoard, key: boardKey(nextBoard) };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const scoreDelta = fastCandidateScore(b, strategy, stepNumber, cache) - fastCandidateScore(a, strategy, stepNumber, cache);
      if (scoreDelta) return scoreDelta;
      return lexCompare(moveSortKey(a.move), moveSortKey(b.move));
    });
}

function chooseLookahead(candidates, visited, strategy, stepNumber, depth, branch, cache, deadline) {
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates.slice(0, branch)) {
    if (performance.now() > deadline) break;
    const score = fastCandidateScore(candidate, strategy, stepNumber, cache)
      + lookaheadScore(candidate.board, visited, strategy, stepNumber + 1, depth - 1, branch, cache, deadline);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best || candidates[0] || null;
}

function lookaheadScore(board, visited, strategy, stepNumber, depth, branch, cache, deadline) {
  if (depth <= 0 || performance.now() > deadline) return boardValue(board, cache);
  if (cache.tileCount(board) === 0) return 10_000_000;
  const candidates = rankedNextStates(board, strategy, stepNumber, cache)
    .filter(next => !visited.has(next.key))
    .slice(0, branch);
  if (!candidates.length) return boardValue(board, cache) - 250_000;

  let best = -Infinity;
  for (const candidate of candidates) {
    if (performance.now() > deadline) break;
    visited.add(candidate.key);
    const score = fastCandidateScore(candidate, strategy, stepNumber, cache)
      + 0.72 * lookaheadScore(candidate.board, visited, strategy, stepNumber + 1, depth - 1, Math.max(4, branch - 2), cache, deadline);
    visited.delete(candidate.key);
    if (score > best) best = score;
  }
  return best;
}

function boardValue(board, cache) {
  const remaining = cache.tileCount(board);
  if (remaining === 0) return 10_000_000;
  const moves = cache.legalMoves(board).length;
  const direct = cache.directMoves(board).length;
  return (140 - remaining) * 650 + Math.min(moves, 160) * 22 + Math.min(direct, 80) * 18 - remaining * 8;
}

function fastCandidateScore(candidate, strategy, stepNumber, cache) {
  const remaining = cache.tileCount(candidate.board);
  const moves = cache.legalMoves(candidate.board).length;
  const direct = cache.directMoves(candidate.board).length;
  const drag = candidate.move.type === "drag";
  const distance = dragDistance(candidate.move);
  let score = (140 - remaining) * 520 + Math.min(moves, 140) * 9 + Math.min(direct, 70) * 6 - remaining * 4;

  const preferDrag = strategy === "dragEarly" || (stepNumber >= 3 && stepNumber <= 20 && remaining >= 80);
  if (drag && preferDrag) score += 260;
  if (!drag && strategy === "directFirst") score += 260;
  if (strategy === "mobility") score += Math.min(moves, 160) * 24;
  if (strategy === "lowBranch") score -= Math.min(moves, 160) * 18;
  if (strategy === "shortDrag" && drag) score += Math.max(0, 150 - distance * 20);
  if (strategy === "longDrag" && drag) score += Math.min(distance, 8) * 30;
  if (remaining < 50 && !drag) score += direct * 16;
  if (moves === 0 && remaining > 0) score -= 500_000;
  if (remaining === 0) score += 10_000_000;
  return score;
}

function rankedBeamCandidates(node, seen, cache) {
  const candidates = cache.legalMoves(node.board)
    .map(move => {
      const nextBoard = applyMove(node.board, move);
      if (!nextBoard) return null;
      const key = boardKey(nextBoard);
      const previousDepth = seen.get(key);
      if (previousDepth !== undefined && previousDepth > node.steps.length + 1) return null;
      return { move, board: nextBoard, key };
    })
    .filter(Boolean);

  return candidates.sort((a, b) => {
    const scoreDelta = beamCandidateScore(b, node, cache) - beamCandidateScore(a, node, cache);
    if (scoreDelta) return scoreDelta;
    return lexCompare(moveSortKey(a.move), moveSortKey(b.move));
  });
}

function uniqueBestNodes(nodes) {
  const bestByKey = new Map();
  for (const node of nodes) {
    const existing = bestByKey.get(node.key);
    if (!existing || node.score > existing.score || node.steps.length > existing.steps.length) {
      bestByKey.set(node.key, node);
    }
  }
  return Array.from(bestByKey.values());
}

function beamCandidateScore(candidate, node, cache) {
  const remaining = cache.tileCount(candidate.board);
  const moves = cache.legalMoves(candidate.board).length;
  const direct = cache.directMoves(candidate.board).length;
  const drag = candidate.move.type === "drag";
  let score = node.steps.length * 10_000;
  score += (140 - remaining) * 360;
  score += Math.min(moves, 180) * 18;
  score += Math.min(direct, 90) * 12;
  score += lineDistanceScore(candidate.move) * 12;

  switch (node.strategy) {
    case "dragBiased":
      if (drag) score += remaining >= 80 ? 900 : 220;
      break;
    case "directBiased":
      if (!drag) score += remaining < 70 ? 700 : 180;
      break;
    case "mobility":
      score += Math.min(moves, 180) * 30;
      break;
    case "lowBranch":
      score -= Math.min(moves, 180) * 24;
      score += Math.min(direct, 90) * 22;
      break;
    case "endgame":
      if (remaining < 60) score += Math.min(direct, 90) * 45 + (140 - remaining) * 180;
      break;
    default:
      if (!drag) score += 120;
      break;
  }

  if (remaining < 50 && !drag) score += direct * 18;
  if (moves === 0 && remaining > 0) score -= 500_000;
  if (remaining === 0) score += 10_000_000;
  return score;
}

function nodeScore(board, steps, lastMove, strategy, cache) {
  const remaining = cache.tileCount(board);
  const moves = cache.legalMoves(board).length;
  const direct = cache.directMoves(board).length;
  let score = steps.length * 11_000 + (140 - remaining) * 450 + Math.min(moves, 180) * 16 + Math.min(direct, 90) * 10;
  if (lastMove?.type === "drag") score += remaining >= 80 ? 380 : 110;
  if (strategy === "mobility") score += Math.min(moves, 180) * 22;
  if (strategy === "lowBranch") score -= Math.min(moves, 180) * 14;
  if (strategy === "endgame" && remaining < 60) score += Math.min(direct, 90) * 35;
  if (remaining === 0) score += 10_000_000;
  if (moves === 0 && remaining > 0) score -= 700_000;
  return score;
}

function dynamicCandidateLimit(board, depth, cache) {
  const remaining = cache.tileCount(board);
  if (remaining <= 32) return 40;
  if (remaining <= 60) return 32;
  if (depth < 12) return 26;
  return 20;
}

function dynamicBeamWidth(board, cache) {
  const remaining = cache.tileCount(board);
  if (remaining <= 32) return 760;
  if (remaining <= 60) return 620;
  if (remaining <= 90) return 460;
  return 340;
}

function dynamicSeedBeamWidth(board, cache) {
  const remaining = cache.tileCount(board);
  if (remaining <= 32) return 360;
  if (remaining <= 60) return 260;
  return 120;
}

function replayPrefix(initial, steps, prefixLength) {
  let board = initial.slice();
  const replayed = [];
  const seen = [boardKey(board)];
  for (const move of steps.slice(0, prefixLength)) {
    const next = applyMove(board, move);
    if (!next) return null;
    board = next;
    replayed.push(move);
    seen.push(boardKey(board));
  }
  return { board, steps: replayed, seen };
}

function endgameDfs(board, cache, deadline, exhausted, depth, maxDepth) {
  if (performance.now() > deadline) return null;
  const remaining = cache.tileCount(board);
  if (remaining === 0) return [];
  if (depth >= maxDepth) return null;

  const key = boardKey(board);
  if (exhausted.has(key)) return null;
  const moves = rankedNextStates(board, "directFirst", depth + 1, cache);
  for (const candidate of moves.slice(0, remaining <= 16 ? 36 : 24)) {
    const suffix = endgameDfs(candidate.board, cache, deadline, exhausted, depth + 1, maxDepth);
    if (suffix) return [candidate.move].concat(suffix);
  }
  exhausted.add(key);
  return null;
}

function repairTail(result, cache) {
  if (!result || result.solved) return result;
  const remaining = cache.tileCount(result.board);
  if (remaining > 32) return result;

  const deadline = performance.now() + 1_500;
  const exhausted = new Set();
  const suffix = endgameDfs(result.board, cache, deadline, exhausted, 0, Math.ceil(remaining / 2) + 4);
  if (!suffix) return result;

  let board = result.board;
  for (const move of suffix) {
    const next = applyMove(board, move);
    if (!next) return result;
    board = next;
  }
  const steps = result.steps.concat(suffix);
  return { steps, board, solved: cache.tileCount(board) === 0 };
}

function directMoves(board) {
  const moves = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!board[i]) continue;
    const a = pos(i);
    for (let j = i + 1; j < CELL_COUNT; j++) {
      if (board[i] !== board[j]) continue;
      const b = pos(j);
      if (clearLine(board, a, b)) moves.push({ type: "remove", a, b });
    }
  }
  return moves;
}

function dragMoves(board) {
  const moves = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!board[i]) continue;
    for (const direction of ["up", "down", "left", "right"]) {
      const move = legalDragMove(board, pos(i), direction);
      if (move) moves.push(move);
    }
  }
  return moves;
}

function legalDragMove(board, start, direction) {
  const icon = board[idx(start.row, start.col)];
  if (!icon) return null;
  const train = dragTrain(board, start, direction);
  if (!train.length) return null;
  const originalTrain = new Set(train.map(p => idx(p.row, p.col)));
  const candidates = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board[i] === icon && !originalTrain.has(i)) candidates.push(pos(i));
  }
  let distance = 0;
  while (true) {
    const nextTrain = train.map(p => movePos(p, direction, distance + 1));
    if (!nextTrain.every(contains)) return null;
    const currentTrain = new Set(train.map(p => idx(movePos(p, direction, distance).row, movePos(p, direction, distance).col)));
    const canMove = nextTrain.every(p => currentTrain.has(idx(p.row, p.col)) || !board[idx(p.row, p.col)]);
    if (!canMove) return null;
    distance += 1;
    const shifted = shiftTrain(board, train, direction, distance);
    const held = movePos(start, direction, distance);
    const moved = new Set(train.map(p => idx(movePos(p, direction, distance).row, movePos(p, direction, distance).col)));
    for (const target of candidates) {
      if (moved.has(idx(target.row, target.col))) continue;
      if (isBehind(target, held, direction)) continue;
      if (shifted[idx(target.row, target.col)] === icon && clearLine(shifted, held, target)) {
        return { type: "drag", start, direction, distance, target };
      }
    }
  }
}

function applyMove(board, move) {
  const next = board.slice();
  if (move.type === "remove") {
    const ai = idx(move.a.row, move.a.col), bi = idx(move.b.row, move.b.col);
    if (!next[ai] || next[ai] !== next[bi] || !clearLine(board, move.a, move.b)) return null;
    next[ai] = 0;
    next[bi] = 0;
    return next;
  }
  const legal = legalDragMove(board, move.start, move.direction);
  if (!legal || legal.distance !== move.distance || idx(legal.target.row, legal.target.col) !== idx(move.target.row, move.target.col)) return null;
  const train = dragTrain(board, move.start, move.direction);
  const shifted = shiftTrain(board, train, move.direction, move.distance);
  const held = movePos(move.start, move.direction, move.distance);
  shifted[idx(held.row, held.col)] = 0;
  shifted[idx(move.target.row, move.target.col)] = 0;
  return shifted;
}

function shiftTrain(board, train, direction, distance) {
  const next = board.slice();
  for (const p of train) next[idx(p.row, p.col)] = 0;
  for (const p of train) {
    const to = movePos(p, direction, distance);
    next[idx(to.row, to.col)] = board[idx(p.row, p.col)];
  }
  return next;
}

function dragTrain(board, start, direction) {
  const train = [];
  let p = start;
  while (contains(p) && board[idx(p.row, p.col)]) {
    train.push(p);
    p = movePos(p, direction, 1);
  }
  return train;
}

function clearLine(board, a, b) {
  if (a.row === b.row) {
    for (let c = Math.min(a.col, b.col) + 1; c < Math.max(a.col, b.col); c++) {
      if (board[idx(a.row, c)]) return false;
    }
    return true;
  }
  if (a.col === b.col) {
    for (let r = Math.min(a.row, b.row) + 1; r < Math.max(a.row, b.row); r++) {
      if (board[idx(r, a.col)]) return false;
    }
    return true;
  }
  return false;
}

function scoreCandidate(candidate, strategy, stepNumber) {
  const moves = legalMoves(candidate.board).length;
  const direct = directMoves(candidate.board).length;
  let score = moves * 8 + direct * 5 - tileCount(candidate.board);
  const drag = candidate.move.type === "drag";
  const preferDrag = strategy === "dragEarly" || (stepNumber >= 3 && stepNumber <= 20 && tileCount(candidate.board) >= 80);
  if (drag && preferDrag) score += 220;
  if (!drag && strategy === "directFirst") score += 220;
  if (strategy === "mobility") score += moves * 18;
  if (strategy === "shortDrag" && drag) score += Math.max(0, 120 - candidate.move.distance * 20);
  if (tileCount(candidate.board) === 0) score += 1_000_000;
  return score;
}

function dragDistance(move) {
  return move?.type === "drag" ? move.distance || 0 : 0;
}

function lineDistanceScore(move) {
  if (move.type === "remove") {
    return Math.abs(move.a.row - move.b.row) + Math.abs(move.a.col - move.b.col);
  }
  return Math.abs(move.start.row - move.target.row) + Math.abs(move.start.col - move.target.col) + (move.distance || 0);
}

function moveSortKey(move) {
  if (move.type === "remove") {
    return [0, idx(move.a.row, move.a.col), idx(move.b.row, move.b.col), 0];
  }
  return [1, idx(move.start.row, move.start.col), directionPriority(move.direction), move.distance || 0, idx(move.target.row, move.target.col)];
}

function directionPriority(direction) {
  return { up: 0, left: 1, right: 2, down: 3 }[direction] ?? 9;
}

function lexCompare(a, b) {
  const count = Math.max(a.length, b.length);
  for (let i = 0; i < count; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function isBehind(target, held, direction) {
  const d = delta(direction);
  if (d.row && target.col === held.col) return (target.row - held.row) * d.row < 0;
  if (d.col && target.row === held.row) return (target.col - held.col) * d.col < 0;
  return false;
}

function delta(direction) {
  return {
    up: { row: -1, col: 0 },
    down: { row: 1, col: 0 },
    left: { row: 0, col: -1 },
    right: { row: 0, col: 1 }
  }[direction];
}

function movePos(p, direction, distance) {
  const d = delta(direction);
  return { row: p.row + d.row * distance, col: p.col + d.col * distance };
}

function directionLabel(direction) {
  return { up: "上", down: "下", left: "左", right: "右" }[direction] || "";
}

function contains(p) {
  return p.row >= 0 && p.row < ROWS && p.col >= 0 && p.col < COLS;
}

function idx(row, col) {
  return row * COLS + col;
}

function pos(index) {
  return { row: Math.floor(index / COLS), col: index % COLS };
}

function tileCount(board) {
  return board.reduce((sum, value) => sum + (value ? 1 : 0), 0);
}

function boardKey(board) {
  return board.join(",");
}

function atlasById(id) {
  return state.atlas.find(entry => entry.id === id);
}

function rms(a, b) {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

function cosineDistance(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return Math.max(0, 1 - dot);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function setStatus(title, text) {
  els.statusText.textContent = text || title || "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}
