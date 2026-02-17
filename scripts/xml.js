import { state } from './state.js';

export function extractInt(node, tag, dflt=0){
  const el = node.getElementsByTagName(tag)[0];
  if (!el) return dflt;
  const v = parseInt(el.textContent || String(dflt), 10);
  return Number.isFinite(v) ? v : dflt;
}

export function getText(node, tag, dflt=''){
  const el = node.getElementsByTagName(tag)[0];
  return el ? (el.textContent ?? dflt) : dflt;
}

export function setText(node, tag, value){
  let el = node.getElementsByTagName(tag)[0];
  if (!el){
    el = state.xmlDoc.createElement(tag);
    node.appendChild(el);
  }
  el.textContent = String(value);
}

export function removeTag(node, tag){
  const el = node.getElementsByTagName(tag)[0];
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

export function isHiddenOnPrint(fieldNode){
  const v = getText(fieldNode, 'Displayed', '1').trim();
  return v === '0';
}

export function getPrintAreaSize(doc){
  if (!doc) return { width: 3200, height: 1200 };

  const width = parseInt(getText(doc, 'MaxImageWidth', '3200'), 10);
  const height = parseInt(getText(doc, 'MaxImageHeight', '1200'), 10);

  return {
    width: Number.isFinite(width) && width > 0 ? width : 3200,
    height: Number.isFinite(height) && height > 0 ? height : 1200
  };
}

export function parseXmlString(raw){
  const p = new DOMParser();
  const doc = p.parseFromString(raw, 'application/xml');
  const pe = doc.getElementsByTagName('parsererror')[0];
  if (pe) throw new Error((pe.textContent || 'XML parse error').slice(0, 350));
  return doc;
}

export function extractFields(){
  state.fields = [];
  if (!state.xmlDoc) return;
  const fieldNodes = Array.from(state.xmlDoc.getElementsByTagName('Field'));
  for (const node of fieldNodes){
    const name = node.getAttribute('Name') || '(no name)';
    const type = getText(node, 'FldType') || '';
    const x = extractInt(node, 'X');
    const y = extractInt(node, 'Y');
    const w = extractInt(node, 'W');
    const h = extractInt(node, 'H');
    state.fields.push({ name, node, type, x, y, w, h });
  }
}

function cdataWrap(s){
  return String(s).replaceAll(']]>', ']]]]><![CDATA[>');
}

function ensureCdataInSerialized(xmlStr){
  const wrapTag = (tag) => {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
    xmlStr = xmlStr.replace(re, (m, inner) => {
      if (inner.includes('<![CDATA[')) return `<${tag}>${inner}</${tag}>`;
      return `<${tag}><![CDATA[${cdataWrap(inner)}]]></${tag}>`;
    });
  };
  wrapTag('CalcData');
  wrapTag('Default');
  return xmlStr;
}

export function serializeCiff(doc){
  const s = new XMLSerializer();
  let xml = s.serializeToString(doc);
  xml = xml.replace(/></g, '>\n<');
  xml = ensureCdataInSerialized(xml);
  return xml;
}

export function getSubImageNode(){
  let sub = state.xmlDoc.getElementsByTagName('SubImage')[0];
  if (!sub){
    sub = state.xmlDoc.createElement('SubImage');
    state.xmlDoc.documentElement.appendChild(sub);
  }
  return sub;
}
