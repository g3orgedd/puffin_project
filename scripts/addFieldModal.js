import { state } from './state.js';
import { $, openModal, setStatus } from './dom.js';
import { getSubImageNode, setText, extractFields, serializeCiff } from './xml.js';
import { selectField, renderFieldList } from './fieldEditor.js';
import { draw } from './preview.js';

function updateNewFieldUI(){
  $('newBarcodeExtra').hidden = ($('newType').value !== 'Barcode');
}

function openAddFieldModal(prefill = {}){
  if (!state.xmlDoc){ setStatus(false, 'Сначала загрузите XML/CIFF файл'); return; }

  $('newType').value = prefill.type ?? 'FixedText';
  $('newName').value = prefill.name ?? '';
  $('newCalc').value = prefill.calc ?? '';
  $('newDisplayed').value = prefill.displayed ?? '1';
  $('newX').value = prefill.x ?? 100;
  $('newY').value = prefill.y ?? 100;
  $('newW').value = prefill.w ?? 800;
  $('newH').value = prefill.h ?? 300;
  $('newOri').value = prefill.ori ?? '';
  $('newSymbol').value = prefill.symbol ?? '22X22';
  $('newModule').value = prefill.module ?? 58;

  updateNewFieldUI();
  openModal(true);
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

function createFieldNode(opts){
  const field = state.xmlDoc.createElement('Field');
  field.setAttribute('Name', opts.name);

  ensureChildText(field, 'FldType', opts.type);
  setText(field, 'X', opts.x);
  setText(field, 'Y', opts.y);
  setText(field, 'W', opts.w);
  setText(field, 'H', opts.h);
  setText(field, 'Ln', '1');
  if (opts.ori !== '') setText(field, 'Orientation', opts.ori);
  setText(field, 'Displayed', opts.displayed);
  setText(field, 'CalcData', opts.calc ?? '');

  if (opts.type === 'Barcode'){
    const data = state.xmlDoc.createElement('Data');
    const obj = state.xmlDoc.createElement('Object');
    obj.setAttribute('Index','0');
    ensureChildText(obj,'DataType','5');
    ensureChildText(obj,'Default', opts.calc ?? '');
    data.appendChild(obj);
    field.appendChild(data);

    const barcode = state.xmlDoc.createElement('Barcode');
    ensureChildText(barcode,'QuietMargin','0');
    const dm = state.xmlDoc.createElement('DataMatrix');
    ensureChildText(dm,'ModuleSize', String(opts.module ?? 58));
    ensureChildText(dm,'SymbolSize', String(opts.symbol ?? '22X22'));
    barcode.appendChild(dm);
    field.appendChild(barcode);
  }

  if (opts.type === 'FixedText'){
    const data = state.xmlDoc.createElement('Data');
    const obj = state.xmlDoc.createElement('Object');
    ensureChildText(obj,'DataType','0');
    ensureChildText(obj,'Default', opts.calc ?? '');
    data.appendChild(obj);
    field.appendChild(data);
  }

  return field;
}

export function wireAddFieldModal(){
  $('newType').addEventListener('change', updateNewFieldUI);

  $('addFieldBtn').addEventListener('click', () => openAddFieldModal());

  $('closeModalBtn').addEventListener('click', () => openModal(false));
  $('modalOverlay').addEventListener('click', (e) => { if (e.target === $('modalOverlay')) openModal(false); });

  $('createFieldBtn').addEventListener('click', () => {
    if (!state.xmlDoc){ setStatus(false, 'Сначала загрузите/распарсьте XML'); return; }

    const type = $('newType').value;
    const name = ($('newName').value || '').trim();
    if (!name){ setStatus(false,'Name обязателен'); return; }
    if (state.fields.some(f => f.name === name)){ setStatus(false,'Name должен быть уникальным'); return; }

    const opts = {
      type,
      name,
      x: parseInt($('newX').value||'0',10) || 0,
      y: parseInt($('newY').value||'0',10) || 0,
      w: parseInt($('newW').value||'0',10) || 0,
      h: parseInt($('newH').value||'0',10) || 0,
      ori: $('newOri').value,
      displayed: $('newDisplayed').value === '0' ? '0' : '1',
      calc: $('newCalc').value ?? '',
      symbol: $('newSymbol').value ?? '22X22',
      module: parseInt($('newModule').value||'58',10) || 58
    };

    const fieldNode = createFieldNode(opts);
    getSubImageNode().appendChild(fieldNode);

    extractFields();
    $('xmlText').value = serializeCiff(state.xmlDoc);
    renderFieldList();

    const idx = state.fields.findIndex(f => f.name === name);
    selectField(idx);
    draw();

    setStatus(true, `Поле добавлено: ${name}`);
    openModal(false);
  });
}

export { openAddFieldModal };
