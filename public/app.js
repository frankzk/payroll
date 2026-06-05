'use strict';

// ---------------- Utilidades ----------------
const MONEDA_SIMBOLO = { PEN: 'S/', USD: 'US$' };
const JORNADA_LABEL = { completo: 'Tiempo completo', medio: 'Medio tiempo', horas: 'Por horas' };

function fmtMonto(valor, moneda) {
  const n = Number(valor || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${MONEDA_SIMBOLO[moneda] || moneda} ${n}`;
}

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ocurrió un error.');
  return data;
}

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  setTimeout(() => el.classList.add('hidden'), 3200);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------- Estado ----------------
let trabajadores = [];

// ---------------- Tabs ----------------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-pagos').classList.toggle('hidden', tab !== 'pagos');
    document.getElementById('tab-trabajadores').classList.toggle('hidden', tab !== 'trabajadores');
  });
});

// ---------------- Modal ----------------
const modal = document.getElementById('modal');
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  modal.classList.remove('hidden');
}
function closeModal() { modal.classList.add('hidden'); }
document.getElementById('modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

// ============================================================
//  RESUMEN
// ============================================================
async function cargarResumen() {
  const resumen = await api('/api/pagos/resumen');
  const cont = document.getElementById('resumen');
  const monedas = Object.keys(resumen);
  if (!monedas.length) { cont.innerHTML = ''; return; }
  cont.innerHTML = monedas
    .map((m) => {
      const r = resumen[m];
      return `<div class="card-resumen">
        <div class="label">Por pagar (${MONEDA_SIMBOLO[m] || m}) · ${r.n_pendiente || 0} pago(s)</div>
        <div class="pendiente">${fmtMonto(r.pendiente, m)}</div>
        <div class="pagado">Ya pagado: ${fmtMonto(r.pagado, m)} · ${r.n_pagado || 0} pago(s)</div>
      </div>`;
    })
    .join('');
}

// ============================================================
//  TRABAJADORES
// ============================================================
async function cargarTrabajadores() {
  trabajadores = await api('/api/trabajadores');
  const cont = document.getElementById('lista-trabajadores');
  if (!trabajadores.length) {
    cont.innerHTML = '<div class="empty">Aún no hay trabajadores. Agrega el primero con “+ Nuevo trabajador”.</div>';
    return;
  }
  cont.innerHTML = trabajadores
    .map((t) => {
      const inactivo = t.activo ? '' : ' <span class="pill">inactivo</span>';
      return `<div class="card">
        <div class="card-row">
          <div>
            <div class="nombre">${esc(t.nombre)}${inactivo}</div>
            <div class="sub">
              <span class="pill">${JORNADA_LABEL[t.tipo_jornada]}</span>
              <span class="pill">${t.modalidad_pago}</span>
              <span class="pill">${MONEDA_SIMBOLO[t.moneda]}</span>
            </div>
          </div>
          <div style="text-align:right">
            <div class="monto">${fmtMonto(t.sueldo_mensual, t.moneda)}</div>
            <div class="sub">valor hora: ${fmtMonto(t.valor_hora, t.moneda)} (${t.horas_referencia} h/mes)</div>
          </div>
        </div>
        ${t.notas ? `<div class="desglose">${esc(t.notas)}</div>` : ''}
        <div class="card-actions">
          <button class="btn small primary" onclick="nuevoPagoPara(${t.id})">+ Pago</button>
          <button class="btn small" onclick="editarTrabajador(${t.id})">Editar</button>
          <button class="btn small ghost danger" onclick="eliminarTrabajador(${t.id})">Eliminar</button>
        </div>
      </div>`;
    })
    .join('');
}

function formTrabajador(t = {}) {
  return `
    <div class="field">
      <label>Nombre *</label>
      <input id="f-nombre" value="${esc(t.nombre || '')}" placeholder="Ej. María Pérez" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Tipo de jornada</label>
        <select id="f-jornada">
          <option value="completo" ${t.tipo_jornada === 'completo' ? 'selected' : ''}>Tiempo completo</option>
          <option value="medio" ${t.tipo_jornada === 'medio' ? 'selected' : ''}>Medio tiempo</option>
          <option value="horas" ${t.tipo_jornada === 'horas' ? 'selected' : ''}>Por horas</option>
        </select>
      </div>
      <div class="field">
        <label>Modalidad de pago</label>
        <select id="f-modalidad">
          <option value="mensual" ${t.modalidad_pago === 'mensual' ? 'selected' : ''}>Mensual</option>
          <option value="quincenal" ${t.modalidad_pago === 'quincenal' ? 'selected' : ''}>Quincenal</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Sueldo mensual</label>
        <input id="f-sueldo" type="number" step="0.01" min="0" value="${t.sueldo_mensual ?? ''}" placeholder="0.00" />
      </div>
      <div class="field">
        <label>Moneda</label>
        <select id="f-moneda">
          <option value="PEN" ${(t.moneda || 'PEN') === 'PEN' ? 'selected' : ''}>Soles (S/)</option>
          <option value="USD" ${t.moneda === 'USD' ? 'selected' : ''}>Dólares (US$)</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Horas de referencia al mes</label>
      <input id="f-horas-ref" type="number" step="1" min="1" value="${t.horas_referencia ?? 240}" />
      <div class="hint">Se usa para calcular el valor de la hora (sueldo ÷ horas). Las horas extra se pagan a ese valor.</div>
    </div>
    <div class="field">
      <label>Notas (opcional)</label>
      <textarea id="f-notas" placeholder="Cualquier detalle...">${esc(t.notas || '')}</textarea>
    </div>
    <button class="btn primary" id="f-guardar" style="width:100%">Guardar</button>
  `;
}

function leerFormTrabajador() {
  return {
    nombre: document.getElementById('f-nombre').value,
    tipo_jornada: document.getElementById('f-jornada').value,
    modalidad_pago: document.getElementById('f-modalidad').value,
    sueldo_mensual: document.getElementById('f-sueldo').value,
    moneda: document.getElementById('f-moneda').value,
    horas_referencia: document.getElementById('f-horas-ref').value,
    notas: document.getElementById('f-notas').value,
  };
}

document.getElementById('btn-nuevo-trabajador').addEventListener('click', () => {
  openModal('Nuevo trabajador', formTrabajador());
  document.getElementById('f-guardar').addEventListener('click', async () => {
    try {
      await api('/api/trabajadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leerFormTrabajador()),
      });
      closeModal();
      toast('Trabajador agregado.');
      await refrescar();
    } catch (e) { toast(e.message, true); }
  });
});

window.editarTrabajador = (id) => {
  const t = trabajadores.find((x) => x.id === id);
  if (!t) return;
  openModal('Editar trabajador', formTrabajador(t));
  document.getElementById('f-guardar').addEventListener('click', async () => {
    try {
      await api(`/api/trabajadores/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leerFormTrabajador()),
      });
      closeModal();
      toast('Cambios guardados.');
      await refrescar();
    } catch (e) { toast(e.message, true); }
  });
};

window.eliminarTrabajador = async (id) => {
  const t = trabajadores.find((x) => x.id === id);
  if (!t) return;
  if (!confirm(`¿Eliminar a ${t.nombre}? Si tiene pagos registrados, solo se marcará como inactivo.`)) return;
  try {
    const r = await api(`/api/trabajadores/${id}`, { method: 'DELETE' });
    toast(r.desactivado ? 'Trabajador desactivado (tenía pagos).' : 'Trabajador eliminado.');
    await refrescar();
  } catch (e) { toast(e.message, true); }
};

// ============================================================
//  PAGOS
// ============================================================
async function cargarPagos() {
  const estado = document.getElementById('filtro-estado').value;
  const pagos = await api('/api/pagos' + (estado ? `?estado=${estado}` : ''));
  const cont = document.getElementById('lista-pagos');
  if (!pagos.length) {
    cont.innerHTML = '<div class="empty">No hay pagos para mostrar. Crea uno con “+ Nuevo pago”.</div>';
    return;
  }
  cont.innerHTML = pagos.map(renderPago).join('');
}

function renderPago(p) {
  const desglose =
    p.horas_extra > 0
      ? `Base ${fmtMonto(p.monto_base, p.moneda)} + ${p.horas_extra}h extra × ${fmtMonto(p.valor_hora, p.moneda)} = ${fmtMonto(p.monto_extra, p.moneda)}`
      : `Base ${fmtMonto(p.monto_base, p.moneda)}`;

  const constancia = p.constancia_path
    ? `<a class="link" href="/api/pagos/${p.id}/constancia" target="_blank" rel="noopener">📎 Ver constancia</a>`
    : '';

  let acciones;
  if (p.estado === 'pagado') {
    acciones = `
      ${constancia}
      <button class="btn small ghost" onclick="revertirPago(${p.id})">Marcar pendiente</button>
      <button class="btn small ghost danger" onclick="eliminarPago(${p.id})">Eliminar</button>`;
  } else {
    acciones = `
      <button class="btn small success" onclick="marcarPagado(${p.id})">✓ Marcar pagado + constancia</button>
      <button class="btn small" onclick="editarPago(${p.id})">Editar</button>
      <button class="btn small ghost danger" onclick="eliminarPago(${p.id})">Eliminar</button>`;
  }

  return `<div class="card ${p.estado}">
    <div class="card-row">
      <div>
        <div class="nombre">${esc(p.trabajador_nombre)} <span class="badge ${p.estado}">${p.estado === 'pagado' ? 'Pagado' : 'Pendiente'}</span></div>
        <div class="sub"><span class="pill">${esc(p.periodo_label)}</span><span class="pill">${p.periodo_tipo}</span>
          ${p.fecha_pago ? `<span class="pill">pagado ${esc(p.fecha_pago)}</span>` : ''}</div>
      </div>
      <div class="monto">${fmtMonto(p.total, p.moneda)}</div>
    </div>
    <div class="desglose">${desglose}</div>
    ${p.nota ? `<div class="desglose">📝 ${esc(p.nota)}</div>` : ''}
    <div class="card-actions">${acciones}</div>
  </div>`;
}

function formPago(p = {}, fijarTrabajador = null) {
  const activos = trabajadores.filter((t) => t.activo || (p.trabajador_id === t.id));
  const opciones = activos
    .map((t) => `<option value="${t.id}" ${p.trabajador_id === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`)
    .join('');
  const disabled = fijarTrabajador ? 'disabled' : '';
  const hoy = new Date();
  const mes = hoy.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  return `
    <div class="field">
      <label>Trabajador *</label>
      <select id="p-trabajador" ${disabled}>${opciones}</select>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Periodo *</label>
        <input id="p-periodo" value="${esc(p.periodo_label || (mes.charAt(0).toUpperCase() + mes.slice(1)))}" placeholder="Ej. Junio 2026" />
      </div>
      <div class="field">
        <label>Tipo de periodo</label>
        <select id="p-tipo">
          <option value="mensual" ${p.periodo_tipo === 'mensual' ? 'selected' : ''}>Mensual</option>
          <option value="quincenal" ${p.periodo_tipo === 'quincenal' ? 'selected' : ''}>Quincenal</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Monto base del periodo</label>
        <input id="p-base" type="number" step="0.01" min="0" value="${p.monto_base ?? ''}" />
        <div class="hint">Se sugiere según sueldo y tipo de periodo. Editable.</div>
      </div>
      <div class="field">
        <label>Moneda</label>
        <select id="p-moneda">
          <option value="PEN" ${(p.moneda || 'PEN') === 'PEN' ? 'selected' : ''}>Soles (S/)</option>
          <option value="USD" ${p.moneda === 'USD' ? 'selected' : ''}>Dólares (US$)</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Horas extra</label>
        <input id="p-horas" type="number" step="0.5" min="0" value="${p.horas_extra ?? 0}" />
      </div>
      <div class="field">
        <label>Valor por hora</label>
        <input id="p-valorhora" type="number" step="0.01" min="0" value="${p.valor_hora ?? ''}" />
        <div class="hint">Auto: sueldo ÷ horas mes.</div>
      </div>
    </div>
    <div class="field">
      <label>Nota (opcional)</label>
      <textarea id="p-nota" placeholder="Cualquier detalle...">${esc(p.nota || '')}</textarea>
    </div>
    <div class="calc-preview">
      <div>Total a pagar:</div>
      <div class="total" id="p-total">—</div>
    </div>
    <button class="btn primary" id="p-guardar" style="width:100%">Guardar pago</button>
  `;
}

function trabajadorSel() {
  const id = Number(document.getElementById('p-trabajador').value);
  return trabajadores.find((t) => t.id === id);
}

function actualizarPreviewPago() {
  const base = Number(document.getElementById('p-base').value) || 0;
  const horas = Number(document.getElementById('p-horas').value) || 0;
  const vh = Number(document.getElementById('p-valorhora').value) || 0;
  const moneda = document.getElementById('p-moneda').value;
  const total = base + horas * vh;
  document.getElementById('p-total').textContent = fmtMonto(total, moneda);
}

// Cuando cambia el trabajador o tipo de periodo, sugerimos base / valor hora / moneda.
function autoSugerirPago(forzar = false) {
  const t = trabajadorSel();
  if (!t) return;
  const tipo = document.getElementById('p-tipo').value;
  const baseEl = document.getElementById('p-base');
  const vhEl = document.getElementById('p-valorhora');
  const monedaEl = document.getElementById('p-moneda');
  const baseSug = tipo === 'quincenal' ? t.sueldo_mensual / 2 : t.sueldo_mensual;
  if (forzar || !baseEl.value) baseEl.value = baseSug ? baseSug.toFixed(2) : '';
  if (forzar || !vhEl.value) vhEl.value = t.valor_hora ? t.valor_hora.toFixed(2) : '';
  if (forzar) monedaEl.value = t.moneda;
  actualizarPreviewPago();
}

function bindFormPago() {
  ['p-base', 'p-horas', 'p-valorhora', 'p-moneda'].forEach((id) =>
    document.getElementById(id).addEventListener('input', actualizarPreviewPago)
  );
  const selT = document.getElementById('p-trabajador');
  if (selT && !selT.disabled) selT.addEventListener('change', () => autoSugerirPago(true));
  document.getElementById('p-tipo').addEventListener('change', () => autoSugerirPago(true));
}

function abrirFormNuevoPago(trabajadorId = null) {
  if (!trabajadores.filter((t) => t.activo).length && !trabajadorId) {
    toast('Primero agrega un trabajador.', true);
    return;
  }
  const pre = trabajadorId ? { trabajador_id: trabajadorId } : {};
  openModal('Nuevo pago', formPago(pre, trabajadorId));
  bindFormPago();
  autoSugerirPago(true);
  document.getElementById('p-guardar').addEventListener('click', async () => {
    try {
      const body = leerFormPago(trabajadorId);
      await api('/api/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      closeModal();
      toast('Pago registrado.');
      await refrescar();
    } catch (e) { toast(e.message, true); }
  });
}

function leerFormPago(fijarTrabajador) {
  return {
    trabajador_id: fijarTrabajador || Number(document.getElementById('p-trabajador').value),
    periodo_label: document.getElementById('p-periodo').value,
    periodo_tipo: document.getElementById('p-tipo').value,
    monto_base: document.getElementById('p-base').value,
    moneda: document.getElementById('p-moneda').value,
    horas_extra: document.getElementById('p-horas').value,
    valor_hora: document.getElementById('p-valorhora').value,
    nota: document.getElementById('p-nota').value,
  };
}

document.getElementById('btn-nuevo-pago').addEventListener('click', () => abrirFormNuevoPago());
window.nuevoPagoPara = (id) => {
  document.querySelector('.tab[data-tab="pagos"]').click();
  abrirFormNuevoPago(id);
};

window.editarPago = async (id) => {
  const pagos = await api('/api/pagos');
  const p = pagos.find((x) => x.id === id);
  if (!p) return;
  openModal('Editar pago', formPago(p, p.trabajador_id));
  bindFormPago();
  actualizarPreviewPago();
  document.getElementById('p-guardar').addEventListener('click', async () => {
    try {
      await api(`/api/pagos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leerFormPago(p.trabajador_id)),
      });
      closeModal();
      toast('Pago actualizado.');
      await refrescar();
    } catch (e) { toast(e.message, true); }
  });
};

window.marcarPagado = (id) => {
  const hoy = new Date().toISOString().slice(0, 10);
  openModal('Confirmar pago', `
    <p class="hint" style="margin-top:0">Sube la constancia de pago (PDF o imagen) para registrar este pago como realizado.</p>
    <div class="field">
      <label>Fecha de pago</label>
      <input id="pp-fecha" type="date" value="${hoy}" />
    </div>
    <div class="field">
      <label>Constancia de pago *</label>
      <input id="pp-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf" />
      <div class="hint">Obligatorio. Máx. 10 MB.</div>
    </div>
    <button class="btn success" id="pp-guardar" style="width:100%">Confirmar pago</button>
  `);
  document.getElementById('pp-guardar').addEventListener('click', async () => {
    const file = document.getElementById('pp-file').files[0];
    if (!file) { toast('Debes adjuntar la constancia.', true); return; }
    const fd = new FormData();
    fd.append('constancia', file);
    fd.append('fecha_pago', document.getElementById('pp-fecha').value);
    try {
      await api(`/api/pagos/${id}/pagar`, { method: 'POST', body: fd });
      closeModal();
      toast('¡Pago confirmado con constancia!');
      await refrescar();
    } catch (e) { toast(e.message, true); }
  });
};

window.revertirPago = async (id) => {
  if (!confirm('¿Marcar este pago como pendiente? Se quitará la constancia adjunta.')) return;
  try {
    await api(`/api/pagos/${id}/revertir`, { method: 'POST' });
    toast('Pago marcado como pendiente.');
    await refrescar();
  } catch (e) { toast(e.message, true); }
};

window.eliminarPago = async (id) => {
  if (!confirm('¿Eliminar este pago? No se puede deshacer.')) return;
  try {
    await api(`/api/pagos/${id}`, { method: 'DELETE' });
    toast('Pago eliminado.');
    await refrescar();
  } catch (e) { toast(e.message, true); }
};

document.getElementById('filtro-estado').addEventListener('change', cargarPagos);

// ============================================================
//  INIT
// ============================================================
async function refrescar() {
  await cargarTrabajadores();
  await cargarPagos();
  await cargarResumen();
}

refrescar().catch((e) => toast(e.message, true));
