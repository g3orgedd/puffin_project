import { state } from './state.js';
import { $, escapeHtml } from './dom.js';
import { getText, setText } from './xml.js';
import { syncXmlFull } from './main.js';

function getBarcodeDataNode(fieldNode){
  let data = fieldNode.getElementsByTagName('Data')[0];
  if (!data){
    data = state.xmlDoc.createElement('Data');
    fieldNode.appendChild(data);
  }
  return data;
}

function getObjectNodes(fieldNode){
  const data = getBarcodeDataNode(fieldNode);
  return Array.from(data.getElementsByTagName('Object')).filter(x => x.parentNode === data);
}

function parseObjectNode(obj){
  const dt = obj.getElementsByTagName('DataType')[0]?.textContent ?? '';
  const def = obj.getElementsByTagName('Default')[0]?.textContent ?? '';
  const src = obj.getElementsByTagName('SrcField')[0]?.getAttribute('SrcFieldName') ?? '';
  const idxAttr = obj.getAttribute('Index');
  const idx = idxAttr === null ? 0 : parseInt(idxAttr, 10);
  return { node: obj, index: Number.isFinite(idx) ? idx : 0, dataType: dt.trim(), def, srcField: src };
}

function setObjectIndex(obj, index){
  obj.setAttribute('Index', String(index));
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

function ensureDefault(obj, value){ ensureChildText(obj, 'Default', value); }

function ensureSrcField(obj, name){
  let el = obj.getElementsByTagName('SrcField')[0];
  if (!el){
    el = state.xmlDoc.createElement('SrcField');
    obj.appendChild(el);
  }
  if (name.trim() === ''){
    if (el.parentNode) el.parentNode.removeChild(el);
  } else {
    el.setAttribute('SrcFieldName', name);
  }
}

function normalizeObjectIndexes(fieldNode){
  const objs = getObjectNodes(fieldNode).map(parseObjectNode).sort((a,b)=>a.index-b.index);
  objs.forEach((o,i) => setObjectIndex(o.node, i));
}

export function renderObjectEditor(){
  const wrap = $('objEditor');
  wrap.innerHTML = '';
  if (!state.xmlDoc || state.selectedIndex < 0) return;
  const f = state.fields[state.selectedIndex];
  if ((f.type || '').toLowerCase() !== 'barcode') return;

  normalizeObjectIndexes(f.node);

  const objs = getObjectNodes(f.node).map(parseObjectNode).sort((a,b)=>a.index-b.index);
  objs.forEach((o) => {
    const row = document.createElement('div');
    row.className = 'objrow';
    row.innerHTML = `
      <div class="field">
        <label>Index</label>
        <input type="number" step="1" value="${o.index}" data-role="idx" />
      </div>
      <div class="field">
        <label>DataType</label>
        <input type="text" value="${escapeHtml(o.dataType)}" data-role="dt" />
      </div>
      <div class="field">
        <label>Default</label>
        <input type="text" value="${escapeHtml(o.def)}" data-role="def" />
      </div>
      <div class="actions">
        <button class="btnsm" data-act="up">↑</button>
        <button class="btnsm" data-act="down">↓</button>
        <button class="btnsm danger" data-act="del">✕</button>
      </div>
      <div class="field" style="grid-column: 1 / -1; margin-top:8px;">
        <label>SrcFieldName</label>
        <input type="text" value="${escapeHtml(o.srcField)}" data-role="src" placeholder="например: GTIN" />
      </div>
    `;

    const idxEl = row.querySelector('[data-role="idx"]');
    const dtEl = row.querySelector('[data-role="dt"]');
    const defEl = row.querySelector('[data-role="def"]');
    const srcEl = row.querySelector('[data-role="src"]');

    idxEl.addEventListener('input', () => {
      const v = parseInt(idxEl.value || '0', 10);
      setObjectIndex(o.node, Number.isFinite(v) ? v : o.index);
      normalizeObjectIndexes(f.node);
      syncXmlFull();
    });
    dtEl.addEventListener('input', () => { ensureChildText(o.node, 'DataType', dtEl.value ?? ''); syncXmlFull(); });
    defEl.addEventListener('input', () => { ensureDefault(o.node, defEl.value ?? ''); syncXmlFull(); });
    srcEl.addEventListener('input', () => { ensureSrcField(o.node, srcEl.value ?? ''); syncXmlFull(); });

    row.querySelector('[data-act="del"]').addEventListener('click', () => {
      if (o.node.parentNode) o.node.parentNode.removeChild(o.node);
      syncXmlFull();
    });
    row.querySelector('[data-act="up"]').addEventListener('click', () => {
      const arr = getObjectNodes(f.node).map(parseObjectNode).sort((a,b)=>a.index-b.index);
      const pos = arr.findIndex(x => x.node === o.node);
      if (pos > 0){
        const prev = arr[pos-1];
        const tmp = prev.index;
        setObjectIndex(prev.node, o.index);
        setObjectIndex(o.node, tmp);
        normalizeObjectIndexes(f.node);
        syncXmlFull();
      }
    });
    row.querySelector('[data-act="down"]').addEventListener('click', () => {
      const arr = getObjectNodes(f.node).map(parseObjectNode).sort((a,b)=>a.index-b.index);
      const pos = arr.findIndex(x => x.node === o.node);
      if (pos >= 0 && pos < arr.length-1){
        const next = arr[pos+1];
        const tmp = next.index;
        setObjectIndex(next.node, o.index);
        setObjectIndex(o.node, tmp);
        normalizeObjectIndexes(f.node);
        syncXmlFull();
      }
    });

    wrap.appendChild(row);
  });
}

export function addObject(){
  if (!state.xmlDoc || state.selectedIndex < 0) return;
  const f = state.fields[state.selectedIndex];
  if ((f.type || '').toLowerCase() !== 'barcode') return;

  const data = getBarcodeDataNode(f.node);
  const obj = state.xmlDoc.createElement('Object');
  // append; index normalized later
  obj.setAttribute('Index', '999');
  ensureChildText(obj, 'DataType', '5');
  ensureDefault(obj, '');
  data.appendChild(obj);

  normalizeObjectIndexes(f.node);
  syncXmlFull();
}

export function buildBarcodeCalcFromObjects(){
  if (!state.xmlDoc || state.selectedIndex < 0) return;
  const f = state.fields[state.selectedIndex];
  if ((f.type || '').toLowerCase() !== 'barcode') return;

  normalizeObjectIndexes(f.node);
  const objs = getObjectNodes(f.node).map(parseObjectNode).sort((a,b)=>a.index-b.index);
  const calc = objs.map(o => o.def ?? '').join('');
  setText(f.node, 'CalcData', calc);
  $('edBarcodeCalc').value = calc;
  syncXmlFull();
}