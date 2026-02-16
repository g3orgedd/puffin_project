import { state } from './state.js';
import { $, setStatus, readTextFile } from './dom.js';
import { parseXmlString, extractFields, serializeCiff, getText, setText, getSubImageNode } from './xml.js';
import { draw, getCanvas, hitTestField, canvasToScreenCoords, screenToWorldCoords } from './preview.js';
import { renderFieldList, selectField, applyEdits, deleteSelected } from './fieldEditor.js';
import { wireAddFieldModal, quickAddField } from './addFieldModal.js';
import { addObject, buildBarcodeCalcFromObjects, renderObjectEditor } from './objectEditor.js';
import { PRESETS } from './presets.js';

/**
 * экспортируем для objectEditor.js (цикличность избегаем: objectEditor импортирует syncXmlFull)
 * здесь — минимальный "public" API
 */
export function syncXmlFull(){
  $('xmlText').value = serializeCiff(state.xmlDoc);
  extractFields();
  renderFieldList();
  // maintain selection by Name if possible
  if (state.selectedIndex >= 0){
    const name = $('edNameInput').value;
    const idx = state.fields.findIndex(f => f.name === name);
    if (idx >= 0) state.selectedIndex = idx;
  }
  if (state.selectedIndex >= 0) selectField(state.selectedIndex);
  else draw();
}

function downloadCiff(){
  if (!state.xmlDoc){ setStatus(false, 'Нет шаблона для скачивания'); return; }
  const ciff = serializeCiff(state.xmlDoc);
  const blob = new Blob([ciff], {type:'application/octet-stream'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'template-edited.ciff';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  setStatus(true, 'Скачивание .ciff началось');
}

function resetAll(){
  state.xmlDoc = null;
  state.fields = [];
  state.selectedIndex = -1;
  $('fieldList').innerHTML = '';
  $('xmlText').value = '';
  $('search').value = '';
  selectField(-1);
  setStatus(true, 'Сброшено');
  draw();
}

function parseFromTextarea(){
  const raw = $('xmlText').value.trim();
  if (!raw){ setStatus(false,'Пустой текст'); return; }
  try{
    state.xmlDoc = parseXmlString(raw);
    extractFields();
    renderFieldList();
    selectField(-1);
    setStatus(true, `Загружено полей: ${state.fields.length}`);
    draw();
  } catch(e){
    setStatus(false, String(e.message || e));
  }
}

function findFieldByName(name){
  return state.fields.find(f => f.name === name) || null;
}

function ensureChildText(parent, tag, value){
  let el = parent.getElementsByTagName(tag)[0];
  if (!el){
    el = state.xmlDoc.createElement(tag);
    parent.appendChild(el);
  }
  el.textContent = String(value);
  return el;
}

function ensureFixedTextField(name, calcData, maxChars){
  let f = findFieldByName(name);
  if (!f){
    const field = state.xmlDoc.createElement('Field');
    field.setAttribute('Name', name);
    ensureChildText(field, 'FldType', 'FixedText');
    setText(field, 'X', '0'); setText(field, 'Y', '0');
    setText(field, 'W', '100'); setText(field, 'H', '100');
    setText(field, 'Ln', '1');
    setText(field, 'Displayed', '0'); // non-printed
    setText(field, 'CalcData', calcData);

    const data = state.xmlDoc.createElement('Data');
    const obj = state.xmlDoc.createElement('Object');
    ensureChildText(obj,'DataType','0');
    ensureChildText(obj,'MaxNoOfChars', String(maxChars ?? calcData.length));
    ensureChildText(obj,'Default', calcData);
    data.appendChild(obj);
    field.appendChild(data);

    getSubImageNode().appendChild(field);
    extractFields();
    f = findFieldByName(name);
  } else {
    setText(f.node,'FldType','FixedText');
    setText(f.node,'Displayed','0');
    setText(f.node,'CalcData', calcData);

    let data = f.node.getElementsByTagName('Data')[0];
    if (!data){ data = state.xmlDoc.createElement('Data'); f.node.appendChild(data); }
    let obj = data.getElementsByTagName('Object')[0];
    if (!obj){ obj = state.xmlDoc.createElement('Object'); data.appendChild(obj); }
    ensureChildText(obj,'DataType','0');
    if (maxChars != null) ensureChildText(obj,'MaxNoOfChars', String(maxChars));
    ensureChildText(obj,'Default', calcData);
  }
  return f;
}

function getBarcodeDataNode(fieldNode){
  let data = fieldNode.getElementsByTagName('Data')[0];
  if (!data){
    data = state.xmlDoc.createElement('Data');
    fieldNode.appendChild(data);
  }
  return data;
}

function applyPresetToSelectedBarcode(presetKey){
  if (!state.xmlDoc || state.selectedIndex < 0) return;
  const bf = state.fields[state.selectedIndex];
  if ((bf.type||'').toLowerCase() !== 'barcode'){
    setStatus(false, 'Пресет можно применить только к полю Barcode');
    return;
  }
  const preset = PRESETS[presetKey];
  if (!preset){ setStatus(false, 'Неизвестный пресет'); return; }

  // ensure FixedText fields exist (non-printed)
  for (const seg of preset.merge){
    ensureFixedTextField(seg.name, seg.value, seg.maxChars);
  }
  extractFields();

  // ensure DataMatrix
  let dm = bf.node.getElementsByTagName('DataMatrix')[0];
  if (!dm){
    let barcodeNode = bf.node.getElementsByTagName('Barcode')[0];
    if (!barcodeNode){
      barcodeNode = state.xmlDoc.createElement('Barcode');
      bf.node.appendChild(barcodeNode);
    }
    dm = state.xmlDoc.createElement('DataMatrix');
    barcodeNode.appendChild(dm);
  }
  setText(dm, 'SymbolSize', preset.symbol);
  if (!getText(dm, 'ModuleSize', '').trim()) setText(dm, 'ModuleSize', '58');

  // rebuild Data/Object list strict
  const data = getBarcodeDataNode(bf.node);
  for (const obj of Array.from(data.children).filter(n => n.tagName === 'Object')) data.removeChild(obj);

  preset.merge.forEach((seg, i) => {
    const obj = state.xmlDoc.createElement('Object');
    obj.setAttribute('Index', String(i));
    ensureChildText(obj, 'DataType', '5');

    const segField = findFieldByName(seg.name);
    const segVal = segField ? getText(segField.node,'CalcData', seg.value) : seg.value;
    ensureChildText(obj, 'Default', segVal);

    const sf = state.xmlDoc.createElement('SrcField');
    sf.setAttribute('SrcFieldName', seg.name);
    obj.appendChild(sf);

    data.appendChild(obj);
  });

  const calc = preset.merge.map(seg => {
    const segField = findFieldByName(seg.name);
    return segField ? getText(segField.node,'CalcData', seg.value) : seg.value;
  }).join('');
  setText(bf.node,'CalcData', calc);

  // update editor fields if visible
  $('edSymbol').value = preset.symbol;
  $('edModule').value = getText(dm,'ModuleSize','');
  $('edBarcodeCalc').value = calc;

  syncXmlFull();
  renderObjectEditor();
  setStatus(true, `Пресет применён: ${presetKey} (SymbolSize=${preset.symbol})`);
}

// ======= Canvas interactions =======
function wireCanvas(){
  const cnv = getCanvas();

  cnv.addEventListener('mousemove', (e) => {
    const { sx, sy } = canvasToScreenCoords(e);

    if (state.draggingField && state.selectedIndex >= 0){
      const wNow = screenToWorldCoords(sx, sy);
      const dx = wNow.x - state.dragStart.wx;
      const dy = wNow.y - state.dragStart.wy;

      const f = state.fields[state.selectedIndex];
      f.x = Math.round(state.dragStart.fx + dx);
      f.y = Math.round(state.dragStart.fy + dy);

      setText(f.node, 'X', f.x);
      setText(f.node, 'Y', f.y);

      $('edX').value = f.x;
      $('edY').value = f.y;

      syncXmlFull();
      return;
    }

    if (state.draggingCanvas){
      state.panX = state.dragStart.panX + (sx - state.dragStart.sx);
      state.panY = state.dragStart.panY + (sy - state.dragStart.sy);
      draw();
      return;
    }

    const hit = hitTestField(sx, sy);
    if (hit !== state.hoverIndex){
      state.hoverIndex = hit;
      draw();
    }
  });

  cnv.addEventListener('mousedown', (e) => {
    const { sx, sy } = canvasToScreenCoords(e);
    const hit = hitTestField(sx, sy);

    if (e.shiftKey){
      state.draggingCanvas = true;
      state.dragStart.sx = sx; state.dragStart.sy = sy;
      state.dragStart.panX = state.panX; state.dragStart.panY = state.panY;
      return;
    }

    if (hit >= 0){
      selectField(hit);
      state.draggingField = true;
      const w = screenToWorldCoords(sx, sy);
      state.dragStart.wx = w.x; state.dragStart.wy = w.y;
      state.dragStart.fx = state.fields[hit].x;
      state.dragStart.fy = state.fields[hit].y;
    } else {
      state.draggingCanvas = true;
      state.dragStart.sx = sx; state.dragStart.sy = sy;
      state.dragStart.panX = state.panX; state.dragStart.panY = state.panY;
    }
  });

  window.addEventListener('mouseup', () => {
    state.draggingCanvas = false;
    state.draggingField = false;
  });

  cnv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { sx, sy } = canvasToScreenCoords(e);

    const before = screenToWorldCoords(sx, sy);
    const factor = Math.exp((-e.deltaY) * 0.0015);
    state.zoom = Math.min(6, Math.max(0.02, state.zoom * factor));
    const after = screenToWorldCoords(sx, sy);

    state.panX += (after.x - before.x) * state.zoom;
    state.panY += (after.y - before.y) * state.zoom;
    draw();
  }, {passive:false});
}

// ======= Wire UI =======
function wireUi(){
  $('search').addEventListener('input', renderFieldList);

  $('quickAddTextBtn').addEventListener('click', () => quickAddField({
    type: 'FixedText',
    name: `TEXT_${state.fields.length + 1}`,
    calc: 'Новый текст',
    w: 800,
    h: 260
  }));

  $('quickAddDateBtn').addEventListener('click', () => quickAddField({
    type: 'FixedText',
    name: `DATE_${state.fields.length + 1}`,
    calc: new Date().toISOString().slice(0, 10),
    w: 500,
    h: 220
  }));

  $('quickAddTimeBtn').addEventListener('click', () => quickAddField({
    type: 'FixedText',
    name: `TIME_${state.fields.length + 1}`,
    calc: new Date().toTimeString().slice(0, 8),
    w: 420,
    h: 220
  }));

  $('quickAddDmBtn').addEventListener('click', () => quickAddField({
    type: 'Barcode',
    name: `DM_${state.fields.length + 1}`,
    calc: '010000000000000021SERIAL123',
    w: 520,
    h: 520,
    symbol: '22X22',
    module: 58
  }));

  $('applyBtn').addEventListener('click', applyEdits);
  $('deleteBtn').addEventListener('click', deleteSelected);

  $('downloadBtn').addEventListener('click', downloadCiff);
  $('resetBtn').addEventListener('click', resetAll);

  $('addObjBtn').addEventListener('click', addObject);
  $('buildCalcBtn').addEventListener('click', buildBarcodeCalcFromObjects);

  $('applyPresetBtn').addEventListener('click', () => applyPresetToSelectedBarcode($('presetSelect').value));

  $('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try{
      const text = await readTextFile(file);
      $('xmlText').value = text;
      parseFromTextarea();
    } catch(err){
      setStatus(false, 'Ошибка чтения: ' + String(err));
    } finally {
      e.target.value = '';
    }
  });

  window.addEventListener('keydown', (e) => {
    const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's'){
      e.preventDefault();
      downloadCiff();
    }
  });
}


function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('themeToggleBtn');
  if (!btn) return;
  const isDark = theme !== 'light';
  const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.8 3.5a8.5 8.5 0 1 0 5.7 14.9 8 8 0 0 1-5.7-14.9z"/></svg>';
  const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.3M12 19.2v2.3M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/></svg>';
  btn.innerHTML = `<span class="themeIcon">${isDark ? moonIcon : sunIcon}</span>`;
  btn.title = isDark ? 'Включить светлую тему' : 'Включить тёмную тему';
  btn.setAttribute('aria-label', btn.title);
}

function wireThemeToggle(){
  const saved = localStorage.getItem('ui-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(initial);

  $('themeToggleBtn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    localStorage.setItem('ui-theme', next);
    applyTheme(next);
  });
}
function init(){
  wireThemeToggle();
  wireUi();
  wireAddFieldModal();
  wireCanvas();
  draw();
  setStatus(true, 'Готово. Загрузите .ciff/.xml файл и начните редактирование.');
}

init();