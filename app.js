const ROWS = 14;
const COLS = 10;
const CELL_COUNT = ROWS * COLS;
const DEFAULT_THRESHOLD = 0.235;
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
  canvasMode: "screenshot"
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
    userAdded
  };
}

async function addAtlasImage(file) {
  const imageData = await readFileAsDataURL(file);
  const image = await loadImage(imageData);
  return {
    id: state.atlas.length + 1,
    uuid: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, "") || nextAvailableAtlasName("砖块"),
    categoryID: state.selectedCategoryID,
    imageData,
    image,
    feature: featureFromImage(image),
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
    const imageData = cropImageToDataURL(image, rect, 120, 120);
    const tileImage = await loadImage(imageData);
    const name = nextAvailableAtlasName("图鉴", used);
    used.add(normalizeName(name));
    drafts.push({
      id: state.atlas.length + drafts.length + 1,
      uuid: crypto.randomUUID(),
      draftID: crypto.randomUUID(),
      name,
      categoryID: state.selectedCategoryID,
      imageData,
      image: tileImage,
      feature: featureFromImage(tileImage),
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
    const size = Math.min(box.w / scale, cellSize);
    return {
      x: box.minX / scale,
      y: box.minY / scale,
      w: size,
      h: size
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
  if (gridRatio < 1.05 || gridRatio > 1.75) return null;
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

function cropImageToDataURL(image, rect, outW = 120, outH = 120) {
  const canvas = makeCanvas(outW, outH);
  const ctx = canvas.getContext("2d");
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
      id: state.atlas.length + 1,
      uuid: draft.uuid || crypto.randomUUID(),
      name,
      categoryID: draft.categoryID || state.selectedCategoryID,
      imageData: draft.imageData,
      image: draft.image,
      feature: draft.feature,
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
  clampAtlasPage();
  persistAtlas();
  renderAtlas();
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
  state.grid = detectGrid(state.image);
  drawPreview();
  recognizeBoard();
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

function recognizeBoard() {
  const image = state.image;
  const grid = state.grid;
  if (!image || !grid) return;
  const atlasEntries = recognitionAtlasEntries();
  const canvas = makeCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const cellW = grid.w / COLS;
  const cellH = grid.h / ROWS;
  const nextBoard = [];
  const nextConfidence = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const rect = {
        x: grid.x + c * cellW,
        y: grid.y + r * cellH,
        w: cellW,
        h: cellH
      };
      if (isEmptyCell(ctx, rect)) {
        nextBoard.push(0);
        nextConfidence.push(1);
        continue;
      }
      const feature = featureFromCanvasRegion(ctx, rect);
      const match = matchAtlas(feature, atlasEntries);
      if (match && match.distance <= DEFAULT_THRESHOLD) {
        nextBoard.push(match.id);
        nextConfidence.push(Math.max(0, 1 - match.distance / DEFAULT_THRESHOLD));
      } else {
        nextBoard.push(1_000_000 + r * COLS + c);
        nextConfidence.push(0);
      }
    }
  }
  state.board = nextBoard;
  state.confidence = nextConfidence;
}

function isEmptyCell(ctx, rect) {
  const image = ctx.getImageData(
    Math.max(0, Math.floor(rect.x + rect.w * 0.18)),
    Math.max(0, Math.floor(rect.y + rect.h * 0.18)),
    Math.max(1, Math.floor(rect.w * 0.64)),
    Math.max(1, Math.floor(rect.h * 0.64))
  );
  let brown = 0;
  let interior = 0;
  const total = image.data.length / 4;
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
    if (r > 105 && r < 185 && g > 55 && g < 125 && b < 65) brown++;
    if (isTileInterior(r, g, b)) interior++;
  }
  return brown / total > 0.38 && interior / total < 0.18;
}

function matchAtlas(feature, entries = state.atlas) {
  let best = null;
  let second = null;
  for (const entry of entries) {
    const distance = rms(feature, entry.feature);
    if (!best || distance < best.distance) {
      second = best;
      best = { id: entry.id, entry, distance };
    } else if (!second || distance < second.distance) {
      second = { id: entry.id, entry, distance };
    }
  }
  if (!best) return null;
  if (second) {
    const gap = second.distance - best.distance;
    const ratio = best.distance / Math.max(second.distance, 0.0001);
    if (best.distance > 0.16 && gap < 0.012 && ratio > 0.94) return null;
  }
  return best;
}

function featureFromImage(image) {
  const canvas = makeCanvas(96, 96);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, 96, 96);
  return featureFromCanvasRegion(ctx, { x: 0, y: 0, w: 96, h: 96 });
}

function featureFromCanvasRegion(ctx, rect) {
  const size = 8;
  const insetX = rect.w * 0.12;
  const insetY = rect.h * 0.12;
  const image = ctx.getImageData(
    Math.max(0, Math.floor(rect.x + insetX)),
    Math.max(0, Math.floor(rect.y + insetY)),
    Math.max(1, Math.floor(rect.w - insetX * 2)),
    Math.max(1, Math.floor(rect.h - insetY * 2))
  );
  const features = [];
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      let sr = 0, sg = 0, sb = 0, count = 0;
      const x0 = Math.floor(gx * image.width / size);
      const x1 = Math.floor((gx + 1) * image.width / size);
      const y0 = Math.floor(gy * image.height / size);
      const y1 = Math.floor((gy + 1) * image.height / size);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * image.width + x) * 4;
          sr += image.data[i] / 255;
          sg += image.data[i + 1] / 255;
          sb += image.data[i + 2] / 255;
          count++;
        }
      }
      const r = sr / Math.max(1, count);
      const g = sg / Math.max(1, count);
      const b = sb / Math.max(1, count);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      features.push(r, g, b, max - min);
    }
  }
  return features;
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
  const solver = new Solver(10_000);
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

class Solver {
  constructor(timeLimitMs = 10_000) {
    this.deadline = performance.now() + timeLimitMs;
  }

  solve(initial) {
    const strategies = ["balanced", "dragEarly", "directFirst", "mobility", "shortDrag"];
    let best = { steps: [], board: initial, solved: false };
    for (const strategy of strategies) {
      const run = this.solveGreedy(initial, strategy);
      if (run.solved || run.steps.length > best.steps.length || tileCount(run.board) < tileCount(best.board)) best = run;
      if (best.solved || performance.now() > this.deadline) break;
    }
    return best;
  }

  solveGreedy(initial, strategy) {
    let board = initial.slice();
    const visited = new Set([boardKey(board)]);
    const steps = [];
    while (performance.now() < this.deadline && tileCount(board) > 0) {
      const candidates = legalMoves(board)
        .map(move => ({ move, board: applyMove(board, move) }))
        .filter(next => next.board && !visited.has(boardKey(next.board)))
        .sort((a, b) => scoreCandidate(b, strategy, steps.length + 1) - scoreCandidate(a, strategy, steps.length + 1));
      if (!candidates.length) break;
      const chosen = candidates[0];
      steps.push(chosen.move);
      board = chosen.board;
      visited.add(boardKey(board));
    }
    return { steps, board, solved: tileCount(board) === 0 };
  }
}

function legalMoves(board) {
  return [...directMoves(board), ...dragMoves(board)];
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
