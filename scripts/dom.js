export const $ = (id) => document.getElementById(id);

export function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

export function setStatus(ok, msg){
  const el = $('status');
  el.innerHTML = ok
    ? `<span class="ok">●</span> ${escapeHtml(msg)}`
    : `<span class="bad">●</span> ${escapeHtml(msg)}`;
}

export function readTextFile(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function openModal(open){
  $('modalOverlay').style.display = open ? 'flex' : 'none';
}