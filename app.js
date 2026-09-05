// ===================== FIREBASE INIT =====================
const firebaseConfig = {
  apiKey: "AIzaSyDdAp803z74IRYxUmafE-n3fZ201TeT8ZM",
  authDomain: "saladecontrole-3301c.firebaseapp.com",
  projectId: "saladecontrole-3301c",
  storageBucket: "saladecontrole-3301c.firebasestorage.app",
  messagingSenderId: "369411957487",
  appId: "1:369411957487:web:3702f52163007ed4ddf11a"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===================== HELPERS =====================
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function formatMoney(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDateBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function daysUntil(iso) {
  const target = new Date(iso + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

// Compress an image file to a base64 string under ~700KB, so it fits
// comfortably inside a single Firestore document.
function compressImage(file, maxDim = 1000, maxBytes = 700000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height *= maxDim / width; width = maxDim; }
      else if (height > maxDim) { width *= maxDim / height; height = maxDim; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      let quality = 0.8;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > maxBytes && quality > 0.2) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===================== MODAL =====================
function openModal(innerHtml, onMount) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet">${innerHtml}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  if (onMount) onMount(overlay);
  return overlay;
}
function closeModal() {
  const overlay = $('.modal-overlay');
  if (overlay) overlay.remove();
}

// ===================== AUTH =====================
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const senha = $('#login-senha').value;
  $('#login-error').textContent = '';
  auth.signInWithEmailAndPassword(email, senha).catch((err) => {
    $('#login-error').textContent = 'E-mail ou senha incorretos.';
  });
});

$('#logout-btn').addEventListener('click', () => auth.signOut());

auth.onAuthStateChanged((user) => {
  if (user) {
    currentUserKey = guessUserKey(user.email);
    $('#login-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    initApp();
  } else {
    $('#login-screen').classList.remove('hidden');
    $('#app').classList.add('hidden');
  }
});

// Best-effort guess of which profile ("thami" or "del") the logged-in
// person is, based on their e-mail. Falls back to "thami".
let currentUserKey = 'thami';
function guessUserKey(email) {
  if (!email) return 'thami';
  return email.toLowerCase().includes('del') ? 'del' : 'thami';
}

// ===================== APP INIT =====================
let currentTab = 'contas';
let unsubscribers = [];
function clearListeners() { unsubscribers.forEach((u) => u()); unsubscribers = []; }

function initApp() {
  setupPostits();
  setupSideMenu();
  goToTab('contas');
}

function setupSideMenu() {
  $$('.icon-btn[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => goToTab(btn.dataset.tab));
  });
}

const TAB_LABELS = {
  cadastro: 'Cadastro',
  contas: 'Contas da casa',
  compras: 'Lista de compras',
  agenda: 'Agenda',
  extras: 'Nem só boletos'
};

function goToTab(tab) {
  currentTab = tab;
  $('#header-subtitulo').textContent = TAB_LABELS[tab];
  $$('.icon-btn[data-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  clearListeners();
  const renderers = {
    cadastro: renderCadastro,
    contas: renderContas,
    compras: renderCompras,
    agenda: renderAgenda,
    extras: renderExtras
  };
  renderers[tab]();
}

// ===================== POST-ITS =====================
function setupPostits() {
  ['thami', 'del'].forEach((autor) => {
    const el = document.querySelector(`.postit[data-autor="${autor}"]`);
    const unsub = db.collection('recados').doc(autor).onSnapshot((doc) => {
      const texto = doc.exists ? doc.data().texto : 'Escreva um recado...';
      if (!el.classList.contains('editing')) {
        el.querySelector('.texto').textContent = texto || 'Escreva um recado...';
      }
    });
    unsubscribers.push(unsub);

    el.addEventListener('click', () => {
      if (el.classList.contains('editing')) return;
      el.classList.add('editing');
      const current = el.querySelector('.texto').textContent;
      el.innerHTML = `<span class="autor">${autor === 'thami' ? 'Thami' : 'Del'}</span>
        <textarea maxlength="220">${current === 'Escreva um recado...' ? '' : current}</textarea>`;
      const textarea = el.querySelector('textarea');
      textarea.focus();
      const save = () => {
        const texto = textarea.value.trim();
        db.collection('recados').doc(autor).set({ texto, atualizadoEm: Date.now() });
        el.classList.remove('editing');
        el.innerHTML = `<span class="autor">${autor === 'thami' ? 'Thami' : 'Del'}</span><span class="texto">${texto || 'Escreva um recado...'}</span>`;
      };
      textarea.addEventListener('blur', save);
    });
  });
}

// ===================== CADASTRO =====================
function renderCadastro() {
  $('#add-btn').classList.add('hidden');
  const el = $('#tab-content');
  el.innerHTML = `
    <div id="perfis-area" class="loading-state">Carregando...</div>
  `;

  const campos = [
    ['nomeCompleto', 'Nome completo'],
    ['contatoEmergencia', 'Contato de emergência'],
    ['alergia', 'Alergia relevante'],
    ['tipoSanguineo', 'Tipo sanguíneo'],
    ['dadosBancarios', 'Dados bancários'],
    ['chavePix', 'Chave pix']
  ];

  Promise.all([
    db.collection('cadastro').doc('thami').get(),
    db.collection('cadastro').doc('del').get()
  ]).then(([tDoc, dDoc]) => {
    const area = $('#perfis-area');
    area.innerHTML = '';
    [['thami', 'Thami', tDoc], ['del', 'Del', dDoc]].forEach(([key, nome, doc]) => {
      const data = doc.exists ? doc.data() : {};
      const card = document.createElement('div');
      card.className = 'perfil-card';
      card.innerHTML = `<h3>${nome}</h3>` +
        campos.map(([f, label]) => `
          <div class="perfil-field">
            <label>${label}</label>
            <input data-field="${f}" value="${(data[f] || '').replace(/"/g, '&quot;')}" />
          </div>`).join('') +
        `<button class="save-btn">Salvar</button>`;
      card.querySelector('.save-btn').addEventListener('click', () => {
        const payload = {};
        campos.forEach(([f]) => { payload[f] = card.querySelector(`[data-field="${f}"]`).value.trim(); });
        db.collection('cadastro').doc(key).set(payload, { merge: true }).then(() => {
          card.querySelector('.save-btn').textContent = 'Salvo!';
          setTimeout(() => { card.querySelector('.save-btn').textContent = 'Salvar'; }, 1500);
        });
      });
      area.appendChild(card);
    });
  });
}

// ===================== CONTAS =====================
function renderContas() {
  $('#add-btn').classList.remove('hidden');
  $('#add-btn').onclick = openContaModal;
  const el = $('#tab-content');
  el.innerHTML = `
    <div class="section-label">Contas da casa</div>
    <div class="resumo-row">
      <img src="assets/contas.jpg" class="resumo-thumb" alt="" />
      <div class="resumo-card"><div class="label">Pendentes</div><div class="valor" id="res-pendentes">-</div></div>
      <div class="resumo-card"><div class="label">Total do mês</div><div class="valor" id="res-total">-</div></div>
    </div>
    <div class="list-area" id="contas-list"><div class="loading-state">Carregando...</div></div>
  `;

  const unsub = db.collection('contas').orderBy('vencimento').onSnapshot((snap) => {
    const contas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const pendentes = contas.filter((c) => c.status !== 'pago');
    const now = new Date();
    const totalMes = contas
      .filter((c) => c.status === 'pago' && c.dataPagamento)
      .filter((c) => {
        const dp = new Date(c.dataPagamento + 'T00:00:00');
        return dp.getMonth() === now.getMonth() && dp.getFullYear() === now.getFullYear();
      })
      .reduce((s, c) => s + (Number(c.valor) || 0), 0);

    $('#res-pendentes').textContent = pendentes.length;
    $('#res-total').textContent = formatMoney(totalMes);

    const list = $('#contas-list');
    if (contas.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhuma conta cadastrada ainda.</div>';
      return;
    }
    list.innerHTML = contas.map((c) => {
      let badge = `<span class="badge pago">paga</span>`;
      if (c.status !== 'pago') {
        const dias = daysUntil(c.vencimento);
        if (dias <= 3) {
          badge = `<span class="badge alerta">${dias < 0 ? 'atrasada' : dias === 0 ? 'vence hoje' : `vence em ${dias}d`}</span>`;
        } else {
          badge = `<span class="badge pendente">pendente</span>`;
        }
      }
      return `<div class="item-card" data-id="${c.id}">
        <div>
          <div class="titulo">${c.nome}</div>
          <div class="meta">vence ${formatDateBR(c.vencimento)}</div>
        </div>
        ${badge}
      </div>`;
    }).join('');
    list.querySelectorAll('.item-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const conta = contas.find((c) => c.id === cardEl.dataset.id);
        openContaModal(conta);
      });
    });
  });
  unsubscribers.push(unsub);
}

function openContaModal(conta) {
  const isEdit = conta && conta.id;
  const html = `
    <h2>${isEdit ? 'Editar conta' : 'Nova conta'}</h2>
    <div class="form-field"><label>Nome da conta</label><input id="f-nome" value="${conta?.nome || ''}" /></div>
    <div class="form-field"><label>Valor</label><input id="f-valor" type="number" step="0.01" value="${conta?.valor || ''}" /></div>
    <div class="form-field"><label>Vencimento</label><input id="f-vencimento" type="date" value="${conta?.vencimento || ''}" /></div>
    <div class="form-field">
      <label>Status</label>
      <select id="f-status">
        <option value="pendente" ${conta?.status !== 'pago' ? 'selected' : ''}>Pendente</option>
        <option value="pago" ${conta?.status === 'pago' ? 'selected' : ''}>Paga</option>
      </select>
    </div>
    <div class="form-field" id="pagamento-fields" style="${conta?.status === 'pago' ? '' : 'display:none'}">
      <label>Quem pagou</label>
      <select id="f-quempagou">
        <option value="Thami" ${conta?.quemPagou === 'Thami' ? 'selected' : ''}>Thami</option>
        <option value="Del" ${conta?.quemPagou === 'Del' ? 'selected' : ''}>Del</option>
      </select>
      <label style="margin-top:8px">Quando pagou</label>
      <input id="f-datapagamento" type="date" value="${conta?.dataPagamento || ''}" />
    </div>
    <div class="form-field">
      <label>Comprovante</label>
      <input id="f-comprovante" type="file" accept="image/*" />
      <img id="comprovante-preview" class="comprovante-preview ${conta?.comprovante ? '' : 'hidden'}" src="${conta?.comprovante || ''}" />
    </div>
    <div class="form-field">
      <label>Observação</label>
      <textarea id="f-obs" maxlength="200">${conta?.observacao || ''}</textarea>
      <div class="char-count"><span id="obs-count">${(conta?.observacao || '').length}</span>/200</div>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn-primary" id="btn-salvar">Salvar</button>
    </div>
    ${isEdit ? '<button class="btn-danger" id="btn-excluir">Excluir conta</button>' : ''}
  `;

  openModal(html, (overlay) => {
    let comprovanteBase64 = conta?.comprovante || null;
    $('#f-status', overlay).addEventListener('change', (e) => {
      $('#pagamento-fields', overlay).style.display = e.target.value === 'pago' ? '' : 'none';
    });
    $('#f-obs', overlay).addEventListener('input', (e) => {
      $('#obs-count', overlay).textContent = e.target.value.length;
    });
    $('#f-comprovante', overlay).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      comprovanteBase64 = await compressImage(file);
      const preview = $('#comprovante-preview', overlay);
      preview.src = comprovanteBase64;
      preview.classList.remove('hidden');
    });
    $('#btn-cancelar', overlay).addEventListener('click', closeModal);
    $('#btn-excluir', overlay)?.addEventListener('click', () => {
      db.collection('contas').doc(conta.id).delete().then(closeModal);
    });
    $('#btn-salvar', overlay).addEventListener('click', () => {
      const status = $('#f-status', overlay).value;
      const payload = {
        nome: $('#f-nome', overlay).value.trim(),
        valor: parseFloat($('#f-valor', overlay).value) || 0,
        vencimento: $('#f-vencimento', overlay).value,
        status,
        quemPagou: status === 'pago' ? $('#f-quempagou', overlay).value : null,
        dataPagamento: status === 'pago' ? $('#f-datapagamento', overlay).value : null,
        comprovante: comprovanteBase64,
        observacao: $('#f-obs', overlay).value.trim()
      };
      if (!payload.nome || !payload.vencimento) return;
      const ref = isEdit ? db.collection('contas').doc(conta.id) : db.collection('contas').doc();
      ref.set(payload, { merge: true }).then(closeModal);
    });
  });
}

// ===================== COMPRAS =====================
let modoContagem = false;
function renderCompras() {
  $('#add-btn').classList.remove('hidden');
  $('#add-btn').onclick = openItemModal;
  const el = $('#tab-content');
  el.innerHTML = `
    <div class="section-label">Lista de compras</div>
    <div class="resumo-row">
      <img src="assets/compras.jpg" class="resumo-thumb" alt="" />
      <div class="resumo-card"><div class="label">Faltando</div><div class="valor" id="res-faltando">-</div></div>
      <button class="resumo-card" id="btn-contagem" style="background:var(--vermelho-escuro);border:none">
        <div class="label">Modo</div><div class="valor" style="font-size:14px">Contagem</div>
      </button>
    </div>
    <div class="list-area" id="compras-list"><div class="loading-state">Carregando...</div></div>
  `;

  $('#btn-contagem').addEventListener('click', () => {
    modoContagem = !modoContagem;
    renderComprasList(lastItens || []);
  });

  let lastItens = [];
  const unsub = db.collection('compras').orderBy('setor').onSnapshot((snap) => {
    lastItens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderComprasList(lastItens);
  });
  unsubscribers.push(unsub);

  function renderComprasList(itens) {
    const faltando = itens.filter((i) => Number(i.atualQtd) < Number(i.idealQtd));
    $('#res-faltando').textContent = faltando.length;
    const list = $('#compras-list');

    if (itens.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhum item cadastrado ainda.</div>';
      return;
    }

    if (modoContagem) {
      list.innerHTML = '<div class="section-label" style="padding-left:0">Preencha a quantidade que vocês têm agora</div>' +
        itens.map((i) => `
          <div class="item-card">
            <div>
              <div class="titulo">${i.nome}</div>
              <div class="meta">${i.setor} · ideal: ${i.idealQtd}</div>
            </div>
            <input type="number" min="0" data-id="${i.id}" class="contagem-input" value="${i.atualQtd}" style="width:64px;padding:6px;border-radius:8px;border:1px solid var(--marrom-claro)" />
          </div>`).join('');
      list.querySelectorAll('.contagem-input').forEach((inp) => {
        inp.addEventListener('change', () => {
          db.collection('compras').doc(inp.dataset.id).update({ atualQtd: Number(inp.value) || 0 });
        });
      });
      return;
    }

    if (faltando.length === 0) {
      list.innerHTML = '<div class="empty-state">Nada faltando por enquanto 🎉</div>';
      return;
    }
    const grupos = {};
    faltando.forEach((i) => {
      const chave = `${i.setor} · ${i.local}`;
      (grupos[chave] = grupos[chave] || []).push(i);
    });
    list.innerHTML = Object.entries(grupos).map(([chave, itensGrupo]) => `
      <div class="compras-grupo">
        <h4>${chave}</h4>
        ${itensGrupo.map((i) => `
          <div class="item-card">
            <label style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer">
              <input type="checkbox" class="comprado-check" data-id="${i.id}" data-ideal="${i.idealQtd}" />
              <div>
                <div class="titulo">${i.nome}</div>
                <div class="meta">comprar ${Number(i.idealQtd) - Number(i.atualQtd)} (tem ${i.atualQtd}, ideal ${i.idealQtd})</div>
              </div>
            </label>
          </div>`).join('')}
      </div>`).join('');
    list.querySelectorAll('.comprado-check').forEach((chk) => {
      chk.addEventListener('change', () => {
        if (chk.checked) {
          db.collection('compras').doc(chk.dataset.id).update({ atualQtd: Number(chk.dataset.ideal) });
        }
      });
    });
  }
}

function openItemModal() {
  const html = `
    <h2>Novo item</h2>
    <div class="form-field"><label>Nome do item</label><input id="f-nome" /></div>
    <div class="form-field"><label>Setor (ex: comida, limpeza)</label><input id="f-setor" /></div>
    <div class="form-field"><label>Onde compram (ex: supermercado)</label><input id="f-local" /></div>
    <div class="form-field"><label>Quantidade ideal</label><input id="f-ideal" type="number" min="0" /></div>
    <div class="form-field"><label>Quantidade atual</label><input id="f-atual" type="number" min="0" value="0" /></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn-primary" id="btn-salvar">Adicionar</button>
    </div>
  `;
  openModal(html, (overlay) => {
    $('#btn-cancelar', overlay).addEventListener('click', closeModal);
    $('#btn-salvar', overlay).addEventListener('click', () => {
      const nome = $('#f-nome', overlay).value.trim();
      if (!nome) return;
      db.collection('compras').add({
        nome,
        setor: $('#f-setor', overlay).value.trim() || 'geral',
        local: $('#f-local', overlay).value.trim() || 'a definir',
        idealQtd: Number($('#f-ideal', overlay).value) || 0,
        atualQtd: Number($('#f-atual', overlay).value) || 0
      }).then(closeModal);
    });
  });
}

// ===================== AGENDA =====================
const COR_RESPONSAVEL = { thami: 'thami', del: 'del', ambas: 'ambas' };
function renderAgenda() {
  $('#add-btn').classList.remove('hidden');
  $('#add-btn').onclick = () => openCompromissoModal();
  const el = $('#tab-content');
  el.innerHTML = `
    <div class="section-label">Agenda</div>
    <div class="resumo-row">
      <img src="assets/agenda.jpg" class="resumo-thumb" alt="" />
      <div class="resumo-card" style="flex:2"><div class="label">Próximo compromisso</div><div class="valor" id="res-proximo" style="font-size:14px">-</div></div>
    </div>
    <div class="list-area" id="agenda-list"><div class="loading-state">Carregando...</div></div>
  `;

  const unsub = db.collection('agenda').orderBy('data').orderBy('hora').onSnapshot((snap) => {
    const eventos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const futuros = eventos.filter((e) => e.data >= new Date().toISOString().slice(0, 10));
    $('#res-proximo').textContent = futuros[0] ? `${futuros[0].titulo} · ${formatDateBR(futuros[0].data)}` : 'Nada marcado';

    const list = $('#agenda-list');
    if (eventos.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhum compromisso ainda.</div>';
      return;
    }
    list.innerHTML = eventos.map((ev) => {
      const conflitos = eventos.filter((e2) => e2.id !== ev.id && e2.data === ev.data && e2.hora === ev.hora);
      return `<div class="item-card agenda-item ${ev.responsavel}" data-id="${ev.id}">
        <div>
          <div class="titulo">${ev.titulo} ${conflitos.length ? '<span class="badge alerta">conflito de horário</span>' : ''}</div>
          <div class="meta">${formatDateBR(ev.data)} · ${ev.hora || ''} · ${ev.responsavel === 'ambas' ? 'Das duas' : ev.responsavel === 'del' ? 'Del' : 'Thami'}</div>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('.item-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const ev = eventos.find((e) => e.id === cardEl.dataset.id);
        openCompromissoModal(ev);
      });
    });
  });
  unsubscribers.push(unsub);
}

function openCompromissoModal(ev) {
  const isEdit = ev && ev.id;
  const html = `
    <h2>${isEdit ? 'Editar compromisso' : 'Novo compromisso'}</h2>
    <div class="form-field"><label>Título</label><input id="f-titulo" value="${ev?.titulo || ''}" /></div>
    <div class="form-field"><label>Data</label><input id="f-data" type="date" value="${ev?.data || ''}" /></div>
    <div class="form-field"><label>Horário</label><input id="f-hora" type="time" value="${ev?.hora || ''}" /></div>
    <div class="form-field">
      <label>De quem é</label>
      <select id="f-responsavel">
        <option value="thami" ${ev?.responsavel === 'thami' ? 'selected' : ''}>Thami (azul)</option>
        <option value="del" ${ev?.responsavel === 'del' ? 'selected' : ''}>Del (laranja)</option>
        <option value="ambas" ${!ev || ev?.responsavel === 'ambas' ? 'selected' : ''}>Das duas (verde)</option>
      </select>
    </div>
    <div class="form-field"><label>Descrição</label><textarea id="f-desc">${ev?.descricao || ''}</textarea></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn-primary" id="btn-salvar">Salvar</button>
    </div>
    ${isEdit ? '<button class="btn-danger" id="btn-excluir">Excluir compromisso</button>' : ''}
  `;
  openModal(html, (overlay) => {
    $('#btn-cancelar', overlay).addEventListener('click', closeModal);
    $('#btn-excluir', overlay)?.addEventListener('click', () => {
      db.collection('agenda').doc(ev.id).delete().then(closeModal);
    });
    $('#btn-salvar', overlay).addEventListener('click', async () => {
      const data = $('#f-data', overlay).value;
      const hora = $('#f-hora', overlay).value;
      const titulo = $('#f-titulo', overlay).value.trim();
      if (!titulo || !data) return;

      const conflitos = await db.collection('agenda').where('data', '==', data).where('hora', '==', hora).get();
      const temConflito = conflitos.docs.some((d) => d.id !== ev?.id);
      if (temConflito && !confirm('Já existe outro compromisso nesse mesmo dia e horário. Salvar mesmo assim?')) return;

      const payload = {
        titulo, data, hora,
        responsavel: $('#f-responsavel', overlay).value,
        descricao: $('#f-desc', overlay).value.trim()
      };
      const ref = isEdit ? db.collection('agenda').doc(ev.id) : db.collection('agenda').doc();
      ref.set(payload, { merge: true }).then(closeModal);
    });
  });
}

// ===================== EXTRAS (NEM SÓ BOLETOS) =====================
function renderExtras() {
  $('#add-btn').classList.remove('hidden');
  $('#add-btn').onclick = () => openExtraModal();
  const el = $('#tab-content');
  el.innerHTML = `
    <div class="section-label">Nem só boletos</div>
    <div class="resumo-row">
      <img src="assets/extras.jpg" class="resumo-thumb" alt="" />
      <div class="resumo-card"><div class="label">Itens</div><div class="valor" id="res-extras">-</div></div>
    </div>
    <div class="list-area" id="extras-list"><div class="loading-state">Carregando...</div></div>
  `;

  const unsub = db.collection('extras').orderBy('data').onSnapshot((snap) => {
    const itens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    $('#res-extras').textContent = itens.length;
    const list = $('#extras-list');
    if (itens.length === 0) {
      list.innerHTML = '<div class="empty-state">Nada por aqui ainda. Que tal planejar algo bom?</div>';
      return;
    }
    list.innerHTML = itens.map((i) => `
      <div class="item-card" data-id="${i.id}">
        <div>
          <div class="titulo">${i.titulo}</div>
          <div class="meta">${formatDateBR(i.data)} · ${formatMoney(i.valorPrevisto)}</div>
        </div>
      </div>`).join('');
    list.querySelectorAll('.item-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const item = itens.find((i) => i.id === cardEl.dataset.id);
        openExtraModal(item);
      });
    });
  });
  unsubscribers.push(unsub);
}

function openExtraModal(item) {
  const isEdit = item && item.id;
  const html = `
    <h2>${isEdit ? 'Editar item' : 'Novo item'}</h2>
    <div class="form-field"><label>Título</label><input id="f-titulo" value="${item?.titulo || ''}" /></div>
    <div class="form-field"><label>Valor previsto</label><input id="f-valor" type="number" step="0.01" value="${item?.valorPrevisto || ''}" /></div>
    <div class="form-field"><label>Data</label><input id="f-data" type="date" value="${item?.data || ''}" /></div>
    <div class="form-field"><label>Detalhes</label><textarea id="f-desc">${item?.descricao || ''}</textarea></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn-primary" id="btn-salvar">Salvar</button>
    </div>
    ${isEdit ? '<button class="btn-danger" id="btn-excluir">Excluir item</button>' : ''}
  `;
  openModal(html, (overlay) => {
    $('#btn-cancelar', overlay).addEventListener('click', closeModal);
    $('#btn-excluir', overlay)?.addEventListener('click', () => {
      db.collection('extras').doc(item.id).delete().then(closeModal);
    });
    $('#btn-salvar', overlay).addEventListener('click', () => {
      const titulo = $('#f-titulo', overlay).value.trim();
      if (!titulo) return;
      const payload = {
        titulo,
        valorPrevisto: parseFloat($('#f-valor', overlay).value) || 0,
        data: $('#f-data', overlay).value,
        descricao: $('#f-desc', overlay).value.trim()
      };
      const ref = isEdit ? db.collection('extras').doc(item.id) : db.collection('extras').doc();
      ref.set(payload, { merge: true }).then(closeModal);
    });
  });
}

// ===================== SERVICE WORKER =====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
