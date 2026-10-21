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
// Os post-its ficam visíveis em todas as abas, então o "escutador" do
// Firestore deles não pode ser desligado quando a pessoa troca de aba
// (clearListeners() roda a cada troca de aba). Por isso ele NÃO entra na
// lista global "unsubscribers" — fica ouvindo o tempo todo, e o recado
// salvo só muda quando alguém escreve um novo.
let postitsInicializados = false;
function setupPostits() {
  if (postitsInicializados) return;
  postitsInicializados = true;
  ['thami', 'del'].forEach((autor) => {
    const el = document.querySelector(`.postit[data-autor="${autor}"]`);
    db.collection('recados').doc(autor).onSnapshot((doc) => {
      const texto = doc.exists ? doc.data().texto : 'Escreva um recado...';
      if (!el.classList.contains('editing')) {
        el.querySelector('.texto').textContent = texto || 'Escreva um recado...';
      }
    });

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
  }, (err) => {
    $('#contas-list').innerHTML = `<div class="empty-state">Não consegui carregar as contas agora. Tente novamente em instantes.</div>`;
    console.error(err);
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
// MODELO NOVO (a partir de out/2026):
// - Coleção "compras": o cadastro de itens (a "lista dos sonhos"). Cada item
//   tem nome, categoria ("onde comprar"), unidade, quantidade ideal e atual.
// - Coleção "comprasSessao", doc único "atual": a lista "O que comprar?" de
//   agora. Só guarda uma entrada por item que está (ou esteve) nessa lista:
//   { comprado, qtdNecessaria, qtdAntesDaCompra }. Um item entra aqui quando
//   fica com quantidade atual menor que a ideal, e só sai quando a lista é
//   finalizada ou cadenciada — não desaparece sozinho.
// - Coleção "comprasHistorico": um registro por lista finalizada/cadenciada,
//   com a data e os itens daquela vez (comprados ou não).
const CATEGORIAS_COMPRA_FIXAS = ['Empório', 'Farmácia', 'Supermercado', 'Sacolão', 'Açougue'];
const UNIDADES_COMPRA_FIXAS = ['Litro', 'Quilo', 'Unidade', 'Pacote'];
let categoriasConhecidas = [...CATEGORIAS_COMPRA_FIXAS];
let unidadesConhecidas = [...UNIDADES_COMPRA_FIXAS];
let compraSubaba = 'sonhos'; // 'sonhos' = Lista dos sonhos | 'comprar' = O que comprar?
let comprasItensAtuais = []; // usado pro aviso de item duplicado

function renderCompras() {
  $('#add-btn').classList.remove('hidden');
  $('#add-btn').onclick = () => openItemModal();
  const el = $('#tab-content');
  el.innerHTML = `
    <div class="section-label">Lista de compras</div>
    <div class="resumo-row">
      <img src="assets/compras.jpg" class="resumo-thumb" alt="" />
      <div class="resumo-card"><div class="label">O que comprar</div><div class="valor" id="res-comprar-contagem">-</div></div>
      <button class="resumo-card" id="btn-toggle-subaba" style="background:var(--vermelho-escuro);border:none">
        <div class="label">Ver</div><div class="valor" id="subaba-label" style="font-size:13px">O que comprar?</div>
      </button>
    </div>
    <div class="list-area" id="compras-list"><div class="loading-state">Carregando...</div></div>
  `;

  $('#btn-toggle-subaba').addEventListener('click', () => {
    compraSubaba = compraSubaba === 'sonhos' ? 'comprar' : 'sonhos';
    atualizarLabelSubaba();
    renderTudo();
  });
  function atualizarLabelSubaba() {
    $('#subaba-label').textContent = compraSubaba === 'sonhos' ? 'O que comprar?' : 'Lista dos sonhos';
  }
  atualizarLabelSubaba();

  let lastItens = [];
  let lastSessaoItens = {};
  let lastHistorico = [];

  function renderTudo() {
    $('#res-comprar-contagem').textContent = listaOQueComprar(lastItens, lastSessaoItens).length;
    if (compraSubaba === 'sonhos') renderListaDosSonhos(lastItens);
    else renderOQueComprar(lastItens, lastSessaoItens, lastHistorico);
  }

  const unsubItens = db.collection('compras').onSnapshot((snap) => {
    lastItens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    comprasItensAtuais = lastItens;
    categoriasConhecidas = [...new Set([...CATEGORIAS_COMPRA_FIXAS, ...lastItens.map((i) => i.categoria).filter(Boolean)])];
    unidadesConhecidas = [...new Set([...UNIDADES_COMPRA_FIXAS, ...lastItens.map((i) => i.unidade).filter(Boolean)])];
    renderTudo();
  }, (err) => {
    $('#compras-list').innerHTML = `<div class="empty-state">Não consegui carregar a lista agora. Tente novamente em instantes.</div>`;
    console.error(err);
  });
  unsubscribers.push(unsubItens);

  const unsubSessao = db.collection('comprasSessao').doc('atual').onSnapshot((doc) => {
    lastSessaoItens = doc.exists ? (doc.data().itens || {}) : {};
    renderTudo();
  });
  unsubscribers.push(unsubSessao);

  const unsubHistorico = db.collection('comprasHistorico').orderBy('criadoEm', 'desc').limit(20).onSnapshot((snap) => {
    lastHistorico = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTudo();
  }, (err) => console.error(err));
  unsubscribers.push(unsubHistorico);
}

// Monta a lista "O que comprar?" a partir do doc de sessão — não recalcula
// sozinha quem está em falta; só mostra quem foi colocado lá (ver
// sincronizarSessaoComItem), até a lista ser finalizada ou cadenciada.
function listaOQueComprar(itens, sessaoItens) {
  const porId = {};
  itens.forEach((i) => { porId[i.id] = i; });
  return Object.entries(sessaoItens || {})
    .map(([id, info]) => {
      const item = porId[id];
      if (!item) return null; // item pode ter sido excluído nesse meio tempo
      return { item, comprado: !!info.comprado, qtdNecessaria: info.qtdNecessaria, qtdAntesDaCompra: info.qtdAntesDaCompra };
    })
    .filter(Boolean);
}

function renderListaDosSonhos(itens) {
  const list = $('#compras-list');
  if (itens.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum item cadastrado ainda. Toque no + para começar a sua lista dos sonhos.</div>';
    return;
  }
  const grupos = {};
  itens.forEach((i) => {
    const chave = i.categoria || 'A categorizar';
    (grupos[chave] = grupos[chave] || []).push(i);
  });
  const categorias = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  categorias.forEach((cat) => grupos[cat].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')));

  list.innerHTML = categorias.map((cat) => `
    <div class="compras-grupo">
      <h4>${cat}</h4>
      ${grupos[cat].map((i) => {
        const ok = Number(i.atualQtd) >= Number(i.idealQtd);
        return `
        <div class="item-card ${ok ? 'compra-ok' : 'compra-falta'}">
          <div style="flex:1">
            <div class="titulo">${i.nome}</div>
            <div class="meta">ideal: ${i.idealQtd} ${i.unidade || ''}</div>
          </div>
          <input type="number" min="0" class="sonhos-input" data-id="${i.id}" value="${i.atualQtd}" style="width:56px;padding:6px;border-radius:8px;border:1px solid var(--marrom-claro)" />
          <button class="sonhos-ok-btn" data-id="${i.id}">OK</button>
          <button class="item-edit-btn" data-id="${i.id}" aria-label="Editar item"><i class="ti ti-pencil"></i></button>
        </div>`;
      }).join('')}
    </div>`).join('');

  list.querySelectorAll('.sonhos-input').forEach((inp) => {
    inp.addEventListener('change', () => {
      const item = itens.find((i) => i.id === inp.dataset.id);
      atualizarEstoque(item, Number(inp.value) || 0);
    });
  });
  list.querySelectorAll('.sonhos-ok-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = itens.find((i) => i.id === btn.dataset.id);
      atualizarEstoque(item, Number(item.idealQtd) || 0);
    });
  });
  list.querySelectorAll('.item-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openItemModal(itens.find((i) => i.id === btn.dataset.id));
    });
  });
}

function renderOQueComprar(itens, sessaoItens, historico) {
  const lista = listaOQueComprar(itens, sessaoItens)
    .sort((a, b) => (a.item.nome || '').localeCompare(b.item.nome || '', 'pt-BR'));
  const list = $('#compras-list');

  const historicoHtml = `
    <div class="hist-toggle" id="compras-hist-toggle" ${historico.length ? '' : 'hidden'}>
      <i class="ti ti-chevron-right"></i> Histórico (<span id="compras-hist-count">${historico.length}</span>)
    </div>
    <div class="list-area hist-area" id="compras-historico" hidden>
      ${historico.map((h) => `
        <div class="item-card">
          <div style="flex:1">
            <div class="titulo">${formatDateBR(h.data)}</div>
            <div class="meta">${(h.itens || []).map((it) => `${it.comprado ? '✓' : '✗'} ${it.nome} (${it.qtdNecessaria} ${it.unidade || ''})`).join(' · ')}</div>
          </div>
        </div>`).join('')}
    </div>
  `;

  if (lista.length === 0) {
    list.innerHTML = '<div class="empty-state">Nada para comprar por enquanto 🎉</div>' + historicoHtml;
    wireHistoricoToggle();
    return;
  }

  list.innerHTML = lista.map((l) => `
    <div class="item-card ${l.comprado ? 'comprado-ok' : ''}">
      <label style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer">
        <input type="checkbox" class="comprar-check" data-id="${l.item.id}" ${l.comprado ? 'checked' : ''} />
        <div>
          <div class="titulo">${l.item.nome}</div>
          <div class="meta">comprar ${l.qtdNecessaria} ${l.item.unidade || ''}${l.item.categoria ? ' · ' + l.item.categoria : ''}</div>
        </div>
      </label>
    </div>`).join('')
    + `<button class="btn-primary" id="btn-finalizar-compras" style="margin-top:6px">Finalizar compras</button>`
    + historicoHtml;

  list.querySelectorAll('.comprar-check').forEach((chk) => {
    chk.addEventListener('change', () => {
      const entry = lista.find((l) => l.item.id === chk.dataset.id);
      if (chk.checked) marcarComprado(entry);
      else desmarcarComprado(entry);
    });
  });
  $('#btn-finalizar-compras').addEventListener('click', () => abrirConfirmacaoFinalizar(lista));
  wireHistoricoToggle();

  function wireHistoricoToggle() {
    const toggle = $('#compras-hist-toggle');
    const hist = $('#compras-historico');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
      hist.hidden = !hist.hidden;
      toggle.classList.toggle('aberto', !hist.hidden);
    });
  }
}

// Atualiza a quantidade atual de um item (pelo campo numérico ou pelo botão
// OK na Lista dos sonhos) e mantém a lista "O que comprar?" em dia.
function atualizarEstoque(item, novoAtual) {
  db.collection('compras').doc(item.id).update({ atualQtd: novoAtual }).then(() => {
    sincronizarSessaoComItem(item, novoAtual);
  });
}

// Garante que a lista "O que comprar?" reflita a nova quantidade: entra na
// lista (ou atualiza quanto falta) se ficou abaixo do ideal; some da lista
// se voltou a ficar ideal SEM ter passado pelo check de "comprado" (ou
// seja, resolvido de outro jeito, sem precisar da compra).
function sincronizarSessaoComItem(item, novoAtual) {
  const precisa = novoAtual < Number(item.idealQtd);
  const sessaoRef = db.collection('comprasSessao').doc('atual');
  if (precisa) {
    return sessaoRef.set({
      itens: { [item.id]: { comprado: false, qtdNecessaria: Number(item.idealQtd) - novoAtual } }
    }, { merge: true });
  }
  return sessaoRef.get().then((doc) => {
    const atual = doc.exists ? (doc.data().itens || {})[item.id] : null;
    if (atual && !atual.comprado) {
      return sessaoRef.set({ itens: { [item.id]: firebase.firestore.FieldValue.delete() } }, { merge: true });
    }
  });
}

// Marcar/desmarcar "comprado" na lista "O que comprar?". Marcar presume que
// foi comprada a quantidade ideal (não precisa informar quanto). Desmarcar
// devolve a quantidade de estoque para o valor de antes da compra.
function marcarComprado(entry) {
  const qtdAntesDaCompra = Number(entry.item.atualQtd);
  db.collection('comprasSessao').doc('atual').set({
    itens: { [entry.item.id]: { comprado: true, qtdNecessaria: entry.qtdNecessaria, qtdAntesDaCompra } }
  }, { merge: true }).then(() => {
    db.collection('compras').doc(entry.item.id).update({ atualQtd: Number(entry.item.idealQtd) });
  });
}

function desmarcarComprado(entry) {
  const voltar = entry.qtdAntesDaCompra ?? (Number(entry.item.idealQtd) - entry.qtdNecessaria);
  db.collection('compras').doc(entry.item.id).update({ atualQtd: voltar }).then(() => {
    db.collection('comprasSessao').doc('atual').set({
      itens: { [entry.item.id]: { comprado: false, qtdNecessaria: entry.qtdNecessaria } }
    }, { merge: true });
  });
}

// Botão "Finalizar compras". Se não há pendente, finaliza direto. Se há
// pendente, pergunta exatamente como a Thami pediu: finalizar (fecha tudo)
// ou cadenciar (só o que tem check vai pro histórico).
function abrirConfirmacaoFinalizar(lista) {
  if (lista.length === 0) return;
  const pendentes = lista.filter((l) => !l.comprado);
  if (pendentes.length === 0) {
    finalizarTudo(lista);
    return;
  }
  const html = `
    <h2>Ainda temos itens pendentes</h2>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">
      Ainda temos itens pendentes na lista. Deseja <strong>finalizar</strong> (isso fecha a lista toda e ela já vai para a caixinha de histórico) ou <strong>cadenciar a lista</strong> (só os itens com check vão para o histórico; o que ainda está pendente permanece na lista de "O que comprar?")?
    </p>
    <div class="modal-actions" style="flex-direction:column">
      <button class="btn-primary" id="btn-finalizar-tudo">Finalizar</button>
      <button class="btn-secondary" id="btn-cadenciar">Cadenciar a lista</button>
    </div>
    <button class="btn-danger" id="btn-voltar-finalizar" style="margin-top:10px">Voltar</button>
  `;
  openModal(html, (overlay) => {
    $('#btn-finalizar-tudo', overlay).addEventListener('click', () => { finalizarTudo(lista); closeModal(); });
    $('#btn-cadenciar', overlay).addEventListener('click', () => { cadenciarLista(lista); closeModal(); });
    $('#btn-voltar-finalizar', overlay).addEventListener('click', closeModal);
  });
}

function finalizarTudo(lista) {
  salvarNoHistorico(lista);
  db.collection('comprasSessao').doc('atual').set({ itens: {} });
}

function cadenciarLista(lista) {
  const comprados = lista.filter((l) => l.comprado);
  if (comprados.length === 0) return;
  salvarNoHistorico(comprados);
  const payload = {};
  comprados.forEach((l) => { payload[`itens.${l.item.id}`] = firebase.firestore.FieldValue.delete(); });
  db.collection('comprasSessao').doc('atual').update(payload);
}

function salvarNoHistorico(lista) {
  const itensHist = lista.map((l) => ({
    nome: l.item.nome,
    categoria: l.item.categoria || '',
    unidade: l.item.unidade || '',
    qtdNecessaria: l.qtdNecessaria,
    comprado: l.comprado
  }));
  db.collection('comprasHistorico').doc().set({
    data: new Date().toISOString().slice(0, 10),
    criadoEm: Date.now(),
    itens: itensHist
  });
}

// Monta um <select> com as opções fixas + já usadas + "+ Novo/Nova...",
// mais um campo de texto escondido que aparece ao escolher essa opção.
function pickListHtml(idPrefix, opcoes, valorAtual, novoLabel, novoPlaceholder) {
  const options = opcoes.map((o) =>
    `<option value="${o}" ${valorAtual === o ? 'selected' : ''}>${o}</option>`
  ).join('');
  return `
    <select id="f-${idPrefix}-select">
      <option value="">Selecionar...</option>
      ${options}
      <option value="__novo__">${novoLabel}</option>
    </select>
    <input id="f-${idPrefix}-novo" placeholder="${novoPlaceholder}" class="hidden" style="margin-top:8px" />
  `;
}
function wirePickList(overlay, idPrefix) {
  $(`#f-${idPrefix}-select`, overlay).addEventListener('change', (e) => {
    $(`#f-${idPrefix}-novo`, overlay).classList.toggle('hidden', e.target.value !== '__novo__');
  });
}
function valorPickList(overlay, idPrefix) {
  const sel = $(`#f-${idPrefix}-select`, overlay).value;
  return sel === '__novo__' ? $(`#f-${idPrefix}-novo`, overlay).value.trim() : sel;
}

function openItemModal(item) {
  const isEdit = item && item.id;
  const opcoesCategoria = [...new Set([...categoriasConhecidas, ...(item?.categoria ? [item.categoria] : [])])];
  const opcoesUnidade = [...new Set([...unidadesConhecidas, ...(item?.unidade ? [item.unidade] : [])])];

  const html = `
    <h2>${isEdit ? 'Editar item' : 'Novo item'}</h2>
    <div class="form-field"><label>Nome do item</label><input id="f-nome" value="${item?.nome || ''}" /></div>
    <div class="form-field">
      <label>Onde comprar</label>
      ${pickListHtml('categoria', opcoesCategoria, item?.categoria, '+ Nova categoria', 'Nome da nova categoria')}
    </div>
    <div class="form-field"><label>Quantidade ideal</label><input id="f-ideal" type="number" min="0" value="${item?.idealQtd ?? ''}" /></div>
    <div class="form-field"><label>Quantidade atual</label><input id="f-atual" type="number" min="0" value="${item?.atualQtd ?? 0}" /></div>
    <div class="form-field">
      <label>Unidade de medida</label>
      ${pickListHtml('unidade', opcoesUnidade, item?.unidade, '+ Nova unidade', 'Nome da nova unidade')}
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn-primary" id="btn-salvar">${isEdit ? 'Salvar' : 'Adicionar'}</button>
    </div>
    ${isEdit ? '<button class="btn-danger" id="btn-excluir">Excluir item</button>' : ''}
  `;
  openModal(html, (overlay) => {
    wirePickList(overlay, 'categoria');
    wirePickList(overlay, 'unidade');
    $('#btn-cancelar', overlay).addEventListener('click', closeModal);
    $('#btn-excluir', overlay)?.addEventListener('click', () => {
      db.collection('compras').doc(item.id).delete();
      db.collection('comprasSessao').doc('atual').set({
        itens: { [item.id]: firebase.firestore.FieldValue.delete() }
      }, { merge: true });
      closeModal();
    });
    $('#btn-salvar', overlay).addEventListener('click', () => {
      const nome = $('#f-nome', overlay).value.trim();
      if (!nome) return;
      if (!isEdit) {
        const duplicado = comprasItensAtuais.some((i) => (i.nome || '').trim().toLowerCase() === nome.toLowerCase());
        if (duplicado && !confirm(`Já existe um item chamado "${nome}" nessa lista. Quer mesmo assim adicionar mais um igual?`)) {
          return;
        }
      }
      const categoria = valorPickList(overlay, 'categoria');
      const unidade = valorPickList(overlay, 'unidade');
      const idealQtd = Number($('#f-ideal', overlay).value) || 0;
      const atualQtd = Number($('#f-atual', overlay).value) || 0;
      const payload = { nome, categoria, unidade, idealQtd, atualQtd };
      const ref = isEdit ? db.collection('compras').doc(item.id) : db.collection('compras').doc();
      ref.set(payload, { merge: true }).then(() => sincronizarSessaoComItem({ id: ref.id, idealQtd }, atualQtd)).then(closeModal);
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
    <div class="hist-toggle" id="agenda-hist-toggle" hidden>
      <i class="ti ti-chevron-right"></i> Histórico (<span id="agenda-hist-count">0</span>)
    </div>
    <div class="list-area hist-area" id="agenda-historico" hidden></div>
  `;

  $('#agenda-hist-toggle').addEventListener('click', () => {
    const hist = $('#agenda-historico');
    hist.hidden = !hist.hidden;
    $('#agenda-hist-toggle').classList.toggle('aberto', !hist.hidden);
  });

  const unsub = db.collection('agenda').onSnapshot((snap) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const eventos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    const futuros = eventos.filter((e) => e.data >= hoje);
    const passados = eventos.filter((e) => e.data < hoje).reverse();
    $('#res-proximo').textContent = futuros[0] ? `${futuros[0].titulo} · ${formatDateBR(futuros[0].data)}` : 'Nada marcado';

    const cardHtml = (ev) => {
      const conflitos = eventos.filter((e2) => e2.id !== ev.id && e2.data === ev.data && e2.hora === ev.hora);
      return `<div class="item-card agenda-item ${ev.responsavel}" data-id="${ev.id}">
        <div>
          <div class="titulo">${ev.titulo} ${conflitos.length ? '<span class="badge alerta">conflito de horário</span>' : ''}</div>
          <div class="meta">${formatDateBR(ev.data)} · ${ev.hora || ''} · ${ev.responsavel === 'ambas' ? 'Das duas' : ev.responsavel === 'del' ? 'Del' : 'Thami'}</div>
          ${ev.obsPassado ? `<div class="meta agenda-obs">Obs: ${ev.obsPassado}</div>` : ''}
        </div>
      </div>`;
    };

    const list = $('#agenda-list');
    list.innerHTML = futuros.length
      ? futuros.map(cardHtml).join('')
      : `<div class="empty-state">${eventos.length ? 'Nenhum compromisso futuro.' : 'Nenhum compromisso ainda.'}</div>`;

    const hist = $('#agenda-historico');
    const toggle = $('#agenda-hist-toggle');
    if (passados.length) {
      hist.innerHTML = passados.map(cardHtml).join('');
      $('#agenda-hist-count').textContent = passados.length;
      toggle.hidden = false;
    } else {
      hist.innerHTML = '';
      hist.hidden = true;
      toggle.hidden = true;
      toggle.classList.remove('aberto');
    }

    // Só os compromissos futuros abrem o modal de editar/excluir.
    list.querySelectorAll('.item-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const ev = eventos.find((e) => e.id === cardEl.dataset.id);
        openCompromissoModal(ev);
      });
    });
    // Os que já foram para o Histórico não podem ser editados nem excluídos —
    // só abrem uma tela pra ler os dados e, se quiser, anotar uma observação
    // (por exemplo, se algo saiu diferente do que estava registrado).
    hist.querySelectorAll('.item-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const ev = eventos.find((e) => e.id === cardEl.dataset.id);
        openObservacaoModal(ev);
      });
    });
  }, (err) => {
    $('#agenda-list').innerHTML = `<div class="empty-state">Não consegui carregar a agenda agora. Tente novamente em instantes.</div>`;
    console.error(err);
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

// Tela de um compromisso que já passou (Histórico). Só mostra os dados —
// não dá pra editar nem excluir — mas permite escrever/atualizar uma
// observação, para o caso de algo ter saído diferente do que foi registrado.
function openObservacaoModal(ev) {
  const html = `
    <h2>Compromisso já passou</h2>
    <div class="form-field">
      <label>Título</label>
      <div>${ev.titulo}</div>
    </div>
    <div class="form-field">
      <label>Quando</label>
      <div>${formatDateBR(ev.data)} · ${ev.hora || ''} · ${ev.responsavel === 'ambas' ? 'Das duas' : ev.responsavel === 'del' ? 'Del' : 'Thami'}</div>
    </div>
    ${ev.descricao ? `<div class="form-field"><label>Descrição registrada</label><div>${ev.descricao}</div></div>` : ''}
    <div class="form-field">
      <label>Observação (se algo saiu diferente do que está registrado aqui)</label>
      <textarea id="f-obs-passado" maxlength="300">${ev.obsPassado || ''}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar">Fechar</button>
      <button class="btn-primary" id="btn-salvar">Salvar observação</button>
    </div>
  `;
  openModal(html, (overlay) => {
    $('#btn-cancelar', overlay).addEventListener('click', closeModal);
    $('#btn-salvar', overlay).addEventListener('click', () => {
      const obsPassado = $('#f-obs-passado', overlay).value.trim();
      db.collection('agenda').doc(ev.id).update({ obsPassado }).then(closeModal);
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
  }, (err) => {
    $('#extras-list').innerHTML = `<div class="empty-state">Não consegui carregar agora. Tente novamente em instantes.</div>`;
    console.error(err);
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

// ===================== SERVICE WORKER (removido) =====================
// O app não usa mais service worker (funcionamento offline), pra evitar
// versões antigas presas no cache do navegador. Este trecho desativa
// qualquer service worker que ainda esteja instalado de uma versão anterior.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => reg.unregister());
  });
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}
