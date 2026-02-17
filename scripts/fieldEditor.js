import { state } from './state.js';
import { $, escapeHtml, setStatus } from './dom.js';
import { getText, setText, removeTag, isHiddenOnPrint, extractFields, serializeCiff } from './xml.js';
import { draw } from './preview.js';
import { renderObjectEditor } from './objectEditor.js';

export function renderFieldList(){
  const list = $('fieldList');
  const q = $('search').value.trim().toLowerCase();
  list.innerHTML = '';

  state.fields.forEach((f, idx) => {
    if (q && !f.name.toLowerCase().includes(q) && !f.type.toLowerCase().includes(q)) return;
    const hidden = isHiddenOnPrint(f.node);
    const div = document.createElement('div');
    div.className = 'item' + (idx === state.selectedIndex ? ' active' : '');
    div.innerHTML = `
      <div class="name">${escapeHtml(f.name)} ${hidden ? '<span class="pill" style="margin-left:6px;">hidden</span>' : ''}</div>
      <div class="meta"><span>${escapeHtml(f.type||'—')}</span><span>X:${f.x} Y:${f.y}</span><span>W:${f.w} H:${f.h}</span></div>
    `;
    div.addEventListener('click', () => selectField(idx));
    list.appendChild(div);
  });
}

export function selectField(idx){
  state.selectedIndex = idx;
  renderFieldList();

  if (idx < 0){
    $('editorEmpty').style.display = '';
    $('editor').style.display = 'none';
    draw();
    return;
  }

  const f = state.fields[idx];
  $('editorEmpty').style.display = 'none';
  $('editor').style.display = '';

  $('edName').textContent = f.name;
  $('edType').textContent = f.type;

  $('edNameInput').value = f.name;
  $('edTypeInput').value = f.type;

  $('edX').value = f.x; $('edY').value = f.y; $('edW').value = f.w; $('edH').value = f.h;
  $('edOri').value = getText(f.node, 'Orientation', '') || '';
  $('edDisplayed').value = isHiddenOnPrint(f.node) ? '0' : '1';

  const isFixedText = (f.type||'').toLowerCase() === 'fixedtext';
  const isBarcode = (f.type||'').toLowerCase() === 'barcode';

  $('textBlock').hidden = !isFixedText;
  $('barcodeBlock').hidden = !isBarcode;

  if (isFixedText){
    $('edCalc').value = getText(f.node,'CalcData','');
    const dataNode = f.node.getElementsByTagName('Data')[0];
    const objNode = dataNode ? dataNode.getElementsByTagName('Object')[0] : null;
    const fontNode = f.node.getElementsByTagName('Font')[0];
    $('edDefault').value = objNode ? getText(objNode, 'Default', '') : '';
    $('edMaxChars').value = objNode ? getText(objNode, 'MaxNoOfChars', '') : '';
    $('edPitch').value = fontNode ? getText(fontNode, 'Pitch', '') : '';

    const userNode = f.node.getElementsByTagName('UserEnterData')[0];
    $('edUser').value = userNode ? (userNode.textContent ?? '') : '';
  } else {
    $('edCalc').value = '';
    $('edDefault').value = '';
    $('edMaxChars').value = '';
    $('edPitch').value = '';
    $('edUser').value = '';
  }

  if (isBarcode){
    const dm = f.node.getElementsByTagName('DataMatrix')[0];
    $('edModule').value = dm ? getText(dm, 'ModuleSize', '') : '';
    $('edSymbol').value = dm ? getText(dm, 'SymbolSize', '') : '';
    $('edBarcodeCalc').value = getText(f.node, 'CalcData', '');
    renderObjectEditor();
  } else {
    $('objEditor').innerHTML = '';
  }

  draw();
}

export function applyEdits(){
  if (!state.xmlDoc || state.selectedIndex < 0) return;
  const f = state.fields[state.selectedIndex];

  const newName = ($('edNameInput').value || '').trim();
  if (!newName){ setStatus(false,'Name не может быть пустым'); return; }
  if (state.fields.some((x,i)=>i!==state.selectedIndex && x.name===newName)){
    setStatus(false,'Name должен быть уникальным'); return;
  }
  f.name = newName;
  f.node.setAttribute('Name', newName);

  const x = parseInt($('edX').value||'0',10);
  const y = parseInt($('edY').value||'0',10);
  const w = parseInt($('edW').value||'0',10);
  const h = parseInt($('edH').value||'0',10);

  f.x = Number.isFinite(x)?x:f.x;
  f.y = Number.isFinite(y)?y:f.y;
  f.w = Number.isFinite(w)?w:f.w;
  f.h = Number.isFinite(h)?h:f.h;

  setText(f.node,'X',f.x); setText(f.node,'Y',f.y); setText(f.node,'W',f.w); setText(f.node,'H',f.h);

  const oriVal = $('edOri').value;
  if (oriVal === '') removeTag(f.node,'Orientation'); else setText(f.node,'Orientation',oriVal);

  if ($('edDisplayed').value === '0') setText(f.node,'Displayed','0');
  else removeTag(f.node,'Displayed');

  const type = (f.type||'').toLowerCase();
  if (type === 'fixedtext'){
    setText(f.node,'CalcData', $('edCalc').value ?? '');

    let data = f.node.getElementsByTagName('Data')[0];
    if (!data){ data = state.xmlDoc.createElement('Data'); f.node.appendChild(data); }
    let obj = data.getElementsByTagName('Object')[0];
    if (!obj){ obj = state.xmlDoc.createElement('Object'); data.appendChild(obj); }
    if (!obj.hasAttribute('Reference')) obj.setAttribute('Reference', '');
    setText(obj,'DataType','0');
    setText(obj,'MaxNoOfChars', $('edMaxChars').value || '0');
    setText(obj,'Default', $('edDefault').value ?? '');

    let textNode = f.node.getElementsByTagName('Text')[0];
    if (!textNode){ textNode = state.xmlDoc.createElement('Text'); f.node.appendChild(textNode); }
    let fontNode = textNode.getElementsByTagName('Font')[0];
    if (!fontNode){ fontNode = state.xmlDoc.createElement('Font'); textNode.appendChild(fontNode); }
    if (($('edPitch').value || '').trim() !== '') setText(fontNode,'Pitch', $('edPitch').value);

    let loggedField = f.node.getElementsByTagName('LoggedField')[0];
    if (!loggedField){ loggedField = state.xmlDoc.createElement('LoggedField'); f.node.appendChild(loggedField); }
  }
  if (type === 'barcode'){
    setText(f.node,'CalcData', $('edBarcodeCalc').value ?? '');
    let dm = f.node.getElementsByTagName('DataMatrix')[0];
    if (dm){
      if (($('edModule').value||'').trim() !== '') setText(dm,'ModuleSize', $('edModule').value);
      if (($('edSymbol').value||'').trim() !== '') setText(dm,'SymbolSize', $('edSymbol').value);
    }
  }

  extractFields();
  $('xmlText').value = serializeCiff(state.xmlDoc);
  renderFieldList();
  // keep selection by name
  const idx = state.fields.findIndex(x => x.name === newName);
  if (idx >= 0) state.selectedIndex = idx;
  selectField(state.selectedIndex);
  setStatus(true, `Изменения применены: ${newName}`);
}

export function deleteSelected(){
  if (!state.xmlDoc || state.selectedIndex < 0) return;
  const f = state.fields[state.selectedIndex];
  if (f.node?.parentNode) f.node.parentNode.removeChild(f.node);

  extractFields();
  state.selectedIndex = -1;
  $('xmlText').value = serializeCiff(state.xmlDoc);
  renderFieldList();
  selectField(-1);
  setStatus(true, `Поле удалено: ${f.name}`);
}