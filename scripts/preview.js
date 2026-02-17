import { state } from './state.js';
import { $ } from './dom.js';
import { getText, isHiddenOnPrint, getPrintAreaSize } from './xml.js';

const cnv = $('cnv');
const ctx = cnv.getContext('2d');

function worldToScreen(wx, wy){ return { x: wx * state.zoom + state.panX, y: wy * state.zoom + state.panY }; }
function screenToWorld(sx, sy){ return { x: (sx - state.panX)/state.zoom, y: (sy - state.panY)/state.zoom }; }

function fitCanvas(){
  const rect = cnv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const targetW = Math.max(600, Math.floor(rect.width * dpr));
  const targetH = Math.max(400, Math.floor((rect.width * 0.75) * dpr));
  if (cnv.width !== targetW || cnv.height !== targetH){
    cnv.width = targetW;
    cnv.height = targetH;
  }
}

function drawGrid(){
  ctx.save();
  ctx.globalAlpha = 0.2;
  const grid = 100 * state.zoom;
  ctx.beginPath();
  for (let x = (state.panX % grid); x < cnv.width; x += grid){
    ctx.moveTo(x, 0); ctx.lineTo(x, cnv.height);
  }
  for (let y = (state.panY % grid); y < cnv.height; y += grid){
    ctx.moveTo(0, y); ctx.lineTo(cnv.width, y);
  }
  ctx.strokeStyle = '#bdb5c8';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawPrintArea(){
  const size = getPrintAreaSize(state.xmlDoc);
  const topLeft = worldToScreen(0, 0);
  const sw = size.width * state.zoom;
  const sh = size.height * state.zoom;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#b9b0c8';
  ctx.lineWidth = 2;
  ctx.fillRect(topLeft.x, topLeft.y, sw, sh);
  ctx.strokeRect(topLeft.x, topLeft.y, sw, sh);
  ctx.restore();
}

function getTemplateFontSize(field){
  const candidates = ['FontSize', 'CharSize', 'TextSize', 'FontHeight'];
  for (const tag of candidates){
    const raw = parseInt(getText(field.node, tag, ''), 10);
    if (Number.isFinite(raw) && raw > 0) return raw;
  }

  if (field.h > 0){
    return Math.max(10, Math.round(field.h * 0.72));
  }
  return 42;
}

function tryRenderDataMatrix(field, sx, sy, sw, sh){
  const text = getText(field.node, 'CalcData', '') || '';
  const dm = field.node.getElementsByTagName('DataMatrix')[0];
  const symbolSize = dm ? getText(dm, 'SymbolSize', '') : '';
  const fmt = (symbolSize || '').replace('X','x');

  if (typeof bwipjs === 'undefined'){
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = `12px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillStyle = '#7a1c17';
    ctx.fillText('bwip-js не загружен (CDN)', sx+6, sy+16);
    ctx.restore();
    return;
  }

  try{
    const off = document.createElement('canvas');
    const opts = { bcid: 'datamatrix', text, scale: 3, includetext: false, padding: 0 };
    if (fmt) opts.format = fmt;
    bwipjs.toCanvas(off, opts);

    const iw = off.width;
    const ih = off.height;
    const scale = Math.min(sw / iw, sh / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = sx + (sw - dw)/2;
    const dy = sy + (sh - dh)/2;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, dx, dy, dw, dh);
    ctx.restore();
  } catch(e){
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = `12px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillStyle = '#7a1c17';
    ctx.fillText('Ошибка DM: ' + String(e).slice(0, 70), sx+6, sy+16);
    ctx.restore();
  }
}

export function draw(){
  fitCanvas();
  ctx.clearRect(0,0,cnv.width, cnv.height);

  ctx.save();
  ctx.fillStyle = '#f3eef6';
  ctx.fillRect(0, 0, cnv.width, cnv.height);
  ctx.restore();

  drawGrid();
  drawPrintArea();

  state.fields.forEach((f, idx) => {
    const p = worldToScreen(f.x, f.y);
    const sw = f.w * state.zoom;
    const sh = f.h * state.zoom;

    const hidden = isHiddenOnPrint(f.node);
    const isSel = idx === state.selectedIndex;
    const isHover = idx === state.hoverIndex;

    ctx.save();
    ctx.lineWidth = isSel ? 3 : (isHover ? 2 : 1);
    ctx.strokeStyle = isSel ? '#6750a4' : (isHover ? '#8670bf' : '#8c84a1');
    ctx.fillStyle = isSel ? 'rgba(103,80,164,0.08)' : 'rgba(103,80,164,0.03)';

    if (hidden){
      ctx.setLineDash([6,6]);
      ctx.globalAlpha = 0.8;
    }

    ctx.fillRect(p.x, p.y, sw, sh);
    ctx.strokeRect(p.x, p.y, sw, sh);
    ctx.setLineDash([]);

    const type = (f.type || '').toLowerCase();
    if (type === 'barcode'){
      tryRenderDataMatrix(f, p.x, p.y, sw, sh);
    } else if (type === 'fixedtext'){
      const txt = getText(f.node, 'CalcData', '');
      const templateFontPx = getTemplateFontSize(f) * state.zoom;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      ctx.font = `${Math.max(10, templateFontPx)}px ${getComputedStyle(document.body).fontFamily}`;
      const pad = 6;
      const ori = getText(f.node,'Orientation','');
      if (ori === '270'){
        ctx.translate(p.x + pad, p.y + sh - pad);
        ctx.rotate(-Math.PI/2);
        ctx.fillText(txt.slice(0, 60), 0, 0);
      } else {
        ctx.fillText(txt.slice(0, 80), p.x + pad, p.y + Math.max(16, 18*state.zoom));
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.font = `${Math.max(10, 11*state.zoom)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = '#2e2837';
    const label = `${f.name}${f.type ? ' • ' + f.type : ''}${hidden ? ' • hidden' : ''}`;
    ctx.fillText(label, p.x + 4, p.y + Math.max(12, 12*state.zoom));
    ctx.restore();

    ctx.restore();
  });

  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.font = `12px ${getComputedStyle(document.body).fontFamily}`;
  ctx.fillStyle = '#625b71';
  ctx.fillText(`zoom=${state.zoom.toFixed(3)}  pan=(${Math.round(state.panX)},${Math.round(state.panY)})`, 12, cnv.height - 14);
  ctx.restore();
}

export function hitTestField(sx, sy){
  for (let i = state.fields.length - 1; i >= 0; i--){
    const f = state.fields[i];
    const p = worldToScreen(f.x, f.y);
    const w = f.w * state.zoom;
    const h = f.h * state.zoom;
    if (sx >= p.x && sx <= p.x + w && sy >= p.y && sy <= p.y + h) return i;
  }
  return -1;
}

export function canvasToScreenCoords(evt){
  const r = cnv.getBoundingClientRect();
  const sx = (evt.clientX - r.left) * (cnv.width / r.width);
  const sy = (evt.clientY - r.top) * (cnv.height / r.height);
  return { sx, sy };
}

export function screenToWorldCoords(sx, sy){
  return screenToWorld(sx, sy);
}

export function getCanvas(){ return cnv; }
