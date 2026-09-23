/* ============================================================
   ENQUETES — painel da SRHS (criar, publicar, acompanhar, exportar)
   Depende de auth-guard.js (window.sbAuth, window.podeEditar)
   ============================================================ */
const TIPOS = {
  texto: "Resposta curta",
  paragrafo: "Texto longo",
  numero: "Número",
  data: "Data",
  sim_nao: "Sim / Não",
  unica: "Escolha uma opção",
  multipla: "Várias opções",
  lista: "Lista suspensa",
};
const COM_OPCOES = ["unica", "multipla", "lista"];
const CONDICIONAIS = ["sim_nao", "unica", "multipla", "lista"];
const STATUS_ROTULO = { rascunho: "Rascunho", aberta: "Recebendo respostas", encerrada: "Encerrada", arquivada: "Arquivada" };

let sb = null;
let enquetes = [];
let resumo = {};
let locaisEfetivo = [];
let efetivoAtivo = [];
let filtroLista = "ativas";
let atual = null;          // enquete em edição (cópia)
let rs = { enquete: null, situacao: [], respostas: [] };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : "q" + Date.now() + Math.random().toString(16).slice(2));
const fmtData = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const linkPublico = (id) => new URL("enquete.html?id=" + id, location.href).href;

function mostrar(view) {
  document.querySelectorAll(".eq-view").forEach((v) => v.classList.toggle("ativa", v.id === view));
  window.scrollTo({ top: 0 });
}
function msg(id, texto, tipo) {
  const el = $(id);
  el.textContent = texto || "";
  el.className = "eq-msg" + (tipo ? " " + tipo : "");
}

/* ---------------- carregamento ---------------- */
async function carregarLista() {
  const [{ data: eqs, error }, { data: res }] = await Promise.all([
    sb.from("enquetes").select("*").order("criado_em", { ascending: false }),
    sb.rpc("enquetes_resumo"),
  ]);
  if (error) { $("lista").innerHTML = `<div class="eq-vazio">Erro ao carregar: ${esc(error.message)}</div>`; return; }
  enquetes = eqs || [];
  resumo = {};
  (res || []).forEach((r) => (resumo[r.enquete_id] = r));
  renderLista();
}

async function carregarEfetivo() {
  const { data } = await sb.from("policiais").select("matricula, local_trabalho, ativo");
  efetivoAtivo = (data || []).filter((p) => p.ativo !== false);
  locaisEfetivo = [...new Set(efetivoAtivo.map((p) => p.local_trabalho).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

/* ---------------- lista ---------------- */
function renderLista() {
  const lista = enquetes.filter((e) => (filtroLista === "arquivada" ? e.status === "arquivada" : e.status !== "arquivada"));
  if (!lista.length) {
    $("lista").innerHTML = filtroLista === "arquivada"
      ? `<div class="eq-vazio">Nenhuma enquete arquivada.</div>`
      : `<div class="eq-vazio">Nenhuma enquete ainda.${window.podeEditar ? "<br>Clique em <b>Nova enquete</b> para montar a primeira." : ""}</div>`;
    return;
  }
  $("lista").innerHTML = lista.map((e) => {
    const r = resumo[e.id] || { publico: 0, respostas: 0 };
    const pct = r.publico ? Math.round((r.respostas / r.publico) * 100) : 0;
    const vencida = e.status === "aberta" && e.prazo && new Date(e.prazo) < new Date();
    const menu = window.podeEditar ? `
      <div class="eq-menu">
        <button type="button" class="ef-btn" data-menu>Mais</button>
        <div class="eq-menu-list">
          ${e.status === "aberta" ? `<button data-acao="encerrar" data-id="${e.id}">Encerrar respostas</button>` : ""}
          ${e.status === "encerrada" ? `<button data-acao="reabrir" data-id="${e.id}">Reabrir respostas</button>` : ""}
          <button data-acao="duplicar" data-id="${e.id}">Duplicar</button>
          ${e.status === "arquivada"
            ? `<button data-acao="desarquivar" data-id="${e.id}">Desarquivar</button>`
            : `<button data-acao="arquivar" data-id="${e.id}">Arquivar</button>`}
          <button class="perigo" data-acao="excluir" data-id="${e.id}">Excluir…</button>
        </div>
      </div>` : "";
    return `<div class="eq-item">
      <div>
        <h3>${esc(e.titulo)}</h3>
        <div class="eq-meta">
          <span class="eq-status ${e.status}">${vencida ? "Prazo encerrado" : STATUS_ROTULO[e.status]}</span>
          <span>${(e.perguntas || []).length} pergunta(s)</span>
          ${e.prazo ? `<span>Prazo: ${fmtData(e.prazo)}</span>` : ""}
          <span>${e.publico?.tipo === "locais" ? esc((e.publico.locais || []).join(", ")) : "Todo o efetivo"}</span>
        </div>
      </div>
      <div class="eq-prog">
        ${e.status === "rascunho" ? "Ainda não publicada" : `<b>${r.respostas}</b> de <b>${r.publico}</b> responderam (${pct}%)<div class="eq-bar"><i style="width:${pct}%"></i></div>`}
      </div>
      <div class="eq-acoes">
        ${e.status !== "rascunho" ? `<button type="button" class="ef-btn primary" data-acao="resultados" data-id="${e.id}">Resultados</button>` : ""}
        ${e.status === "aberta" ? `<button type="button" class="ef-btn" data-acao="copiar" data-id="${e.id}">Copiar link</button>` : ""}
        ${window.podeEditar ? `<button type="button" class="ef-btn" data-acao="editar" data-id="${e.id}">Editar</button>` : ""}
        ${menu}
      </div>
    </div>`;
  }).join("");
}

$("lista").addEventListener("click", async (ev) => {
  const bMenu = ev.target.closest("[data-menu]");
  if (bMenu) {
    const m = bMenu.parentElement;
    document.querySelectorAll(".eq-menu.aberto").forEach((x) => x !== m && x.classList.remove("aberto"));
    m.classList.toggle("aberto");
    return;
  }
  const b = ev.target.closest("[data-acao]");
  if (!b) return;
  document.querySelectorAll(".eq-menu.aberto").forEach((x) => x.classList.remove("aberto"));
  const e = enquetes.find((x) => x.id === b.dataset.id);
  const acao = b.dataset.acao;
  if (acao === "editar") return abrirEditor(e);
  if (acao === "resultados") return abrirResultados(e);
  if (acao === "copiar") return copiarLink(e.id, b);
  if (acao === "duplicar") {
    const copia = { ...e, id: undefined, titulo: e.titulo + " (cópia)", status: "rascunho", publicado_em: null,
      perguntas: JSON.parse(JSON.stringify(e.perguntas || [])) };
    return abrirEditor(copia);
  }
  const mudar = { encerrar: "encerrada", reabrir: "aberta", arquivar: "arquivada", desarquivar: "encerrada" }[acao];
  if (mudar) {
    const { error } = await sb.from("enquetes").update({ status: mudar, atualizado_em: new Date().toISOString() }).eq("id", e.id);
    if (error) return alert("Não foi possível alterar: " + error.message);
    return carregarLista();
  }
  if (acao === "excluir") {
    const r = resumo[e.id] || { respostas: 0 };
    const conf = prompt(
      `Excluir "${e.titulo}" apaga a enquete e ${r.respostas} resposta(s) para sempre.\n` +
      `Se quiser só tirar da lista, use "Arquivar".\n\nPara confirmar, digite EXCLUIR:`);
    if ((conf || "").trim().toUpperCase() !== "EXCLUIR") return;
    const { error } = await sb.from("enquetes").delete().eq("id", e.id);
    if (error) return alert("Não foi possível excluir: " + error.message);
    carregarLista();
  }
});
document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".eq-menu")) document.querySelectorAll(".eq-menu.aberto").forEach((x) => x.classList.remove("aberto"));
});
document.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-filtro]").forEach((x) => x.classList.toggle("active", x === b));
  filtroLista = b.dataset.filtro;
  renderLista();
}));
document.querySelectorAll("[data-voltar]").forEach((b) => b.addEventListener("click", () => {
  if (document.getElementById("v-editor").classList.contains("ativa") && atual && atual._alterado &&
      !confirm("Sair sem salvar as alterações?")) return;
  mostrar("v-lista");
  carregarLista();
}));

async function copiarLink(id, btn) {
  const url = linkPublico(id);
  try { await navigator.clipboard.writeText(url); } catch { prompt("Copie o link:", url); return; }
  if (btn) { const t = btn.textContent; btn.textContent = "Link copiado"; setTimeout(() => (btn.textContent = t), 1500); }
}

/* ---------------- editor ---------------- */
$("btn-nova").addEventListener("click", () => abrirEditor({
  titulo: "", descricao: "", status: "rascunho", prazo: null, publico: { tipo: "todos" },
  permitir_edicao: true, perguntas: [],
}));

function abrirEditor(e) {
  atual = JSON.parse(JSON.stringify(e));
  atual._alterado = false;
  $("ed-titulo-pagina").textContent = atual.id ? "Editar enquete" : "Nova enquete";
  $("ed-status").textContent = STATUS_ROTULO[atual.status];
  $("ed-status").className = "eq-status " + atual.status;
  $("ed-titulo").value = atual.titulo || "";
  $("ed-descricao").value = atual.descricao || "";
  $("ed-prazo").value = atual.prazo ? toLocalInput(atual.prazo) : "";
  $("ed-edicao").checked = atual.permitir_edicao !== false;
  const tipoPub = atual.publico?.tipo === "locais" ? "locais" : "todos";
  document.querySelectorAll('input[name="ed-publico"]').forEach((r) => (r.checked = r.value === tipoPub));
  renderLocais();
  renderPerguntas();
  const r = atual.id ? resumo[atual.id] : null;
  $("ed-aviso").textContent = r && r.respostas ? `Já existem ${r.respostas} resposta(s). Mudar ou remover perguntas afeta a leitura dessas respostas.` : "";
  $("btn-publicar").textContent = atual.status === "aberta" ? "Salvar alterações" : "Salvar e publicar";
  $("btn-salvar").style.display = atual.status === "aberta" ? "none" : "";
  msg("ed-msg", "");
  mostrar("v-editor");
}
function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function marcarAlterado() { if (atual) atual._alterado = true; }

function renderLocais() {
  const tipo = document.querySelector('input[name="ed-publico"]:checked').value;
  atual.publico = tipo === "locais" ? { tipo, locais: atual.publico?.locais || [] } : { tipo: "todos" };
  $("ed-locais").hidden = tipo !== "locais";
  $("ed-locais").innerHTML = locaisEfetivo.map((l) =>
    `<span class="eq-chip ${atual.publico.locais?.includes(l) ? "on" : ""}" data-local="${esc(l)}" tabindex="0">${esc(l)}</span>`).join("");
  const alvo = tipo === "todos" ? efetivoAtivo : efetivoAtivo.filter((p) => atual.publico.locais.includes(p.local_trabalho));
  const semLocal = efetivoAtivo.filter((p) => !p.local_trabalho).length;
  $("ed-publico-total").textContent = `${alvo.length} policial(is) vão receber esta enquete.` +
    (tipo === "locais" && semLocal ? ` ${semLocal} policial(is) sem local de trabalho no efetivo não entram.` : "");
}
document.querySelectorAll('input[name="ed-publico"]').forEach((r) => r.addEventListener("change", () => { marcarAlterado(); renderLocais(); }));
$("ed-locais").addEventListener("click", (ev) => {
  const c = ev.target.closest("[data-local]");
  if (!c) return;
  const l = c.dataset.local;
  const arr = atual.publico.locais;
  const i = arr.indexOf(l);
  i >= 0 ? arr.splice(i, 1) : arr.push(l);
  marcarAlterado();
  renderLocais();
});
["ed-titulo", "ed-descricao", "ed-prazo", "ed-edicao"].forEach((id) => $(id).addEventListener("input", marcarAlterado));

$("ed-add").innerHTML = Object.entries(TIPOS).map(([k, v]) => `<button type="button" class="ef-btn" data-add="${k}">+ ${v}</button>`).join("");
$("ed-add").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-add]");
  if (!b) return;
  lerPerguntasDoDom();
  const tipo = b.dataset.add;
  atual.perguntas.push({ id: novoId(), tipo, titulo: "", ajuda: "", obrigatoria: true,
    opcoes: COM_OPCOES.includes(tipo) ? ["Opção 1", "Opção 2"] : [], condicao: null });
  marcarAlterado();
  renderPerguntas();
  const cards = document.querySelectorAll(".eq-q");
  const ult = cards[cards.length - 1];
  if (ult) { ult.scrollIntoView({ behavior: "smooth", block: "center" }); ult.querySelector("[data-f=titulo]").focus(); }
});

function opcoesDaPergunta(q) {
  if (q.tipo === "sim_nao") return ["Sim", "Não"];
  return COM_OPCOES.includes(q.tipo) ? (q.opcoes || []) : [];
}

function renderPerguntas() {
  const ps = atual.perguntas;
  if (!ps.length) {
    $("ed-perguntas").innerHTML = `<div class="eq-vazio">Nenhuma pergunta. Use os botões abaixo para adicionar.</div>`;
    return;
  }
  $("ed-perguntas").innerHTML = ps.map((q, i) => {
    const anteriores = ps.slice(0, i).filter((a) => CONDICIONAIS.includes(a.tipo));
    const condQ = q.condicao ? ps.find((a) => a.id === q.condicao.pergunta) : null;
    return `<div class="eq-q" data-id="${q.id}">
      <div class="eq-q-head">
        <span class="eq-q-num">${i + 1}</span>
        <select class="eq-in" data-f="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${q.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <label class="eq-check"><input type="checkbox" data-f="obrigatoria" ${q.obrigatoria ? "checked" : ""}> Obrigatória</label>
        <div class="eq-q-tools">
          <button type="button" class="eq-ico" data-q="subir" title="Mover para cima" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="eq-ico" data-q="descer" title="Mover para baixo" ${i === ps.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="eq-ico" data-q="duplicar" title="Duplicar">⧉</button>
          <button type="button" class="eq-ico perigo" data-q="remover" title="Remover">✕</button>
        </div>
      </div>
      <input class="eq-in" data-f="titulo" placeholder="Escreva a pergunta" value="${esc(q.titulo)}">
      <div class="eq-q-extra">
        <input class="eq-in" data-f="ajuda" placeholder="Explicação curta (opcional)" value="${esc(q.ajuda)}">
        ${COM_OPCOES.includes(q.tipo) ? `<textarea class="eq-in" data-f="opcoes" rows="3" placeholder="Uma opção por linha">${esc((q.opcoes || []).join("\n"))}</textarea>` : "<div></div>"}
      </div>
      ${anteriores.length ? `<div class="eq-cond" style="margin-top:10px;">
        Mostrar esta pergunta
        <select class="eq-in" data-f="cond-pergunta">
          <option value="">sempre</option>
          ${anteriores.map((a) => `<option value="${a.id}" ${condQ && condQ.id === a.id ? "selected" : ""}>só se "${esc((a.titulo || "pergunta " + (ps.indexOf(a) + 1)).slice(0, 50))}"</option>`).join("")}
        </select>
        ${condQ ? `for <select class="eq-in" data-f="cond-valor">${opcoesDaPergunta(condQ).map((o) => `<option ${q.condicao.valor === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : ""}
      </div>` : ""}
    </div>`;
  }).join("");
}

function lerPerguntasDoDom() {
  document.querySelectorAll(".eq-q").forEach((el) => {
    const q = atual.perguntas.find((x) => x.id === el.dataset.id);
    if (!q) return;
    q.tipo = el.querySelector("[data-f=tipo]").value;
    q.titulo = el.querySelector("[data-f=titulo]").value.trim();
    q.ajuda = el.querySelector("[data-f=ajuda]").value.trim();
    q.obrigatoria = el.querySelector("[data-f=obrigatoria]").checked;
    const op = el.querySelector("[data-f=opcoes]");
    q.opcoes = COM_OPCOES.includes(q.tipo)
      ? (op ? [...new Set(op.value.split("\n").map((s) => s.trim()).filter(Boolean))] : q.opcoes || [])
      : [];
    const cp = el.querySelector("[data-f=cond-pergunta]");
    const cv = el.querySelector("[data-f=cond-valor]");
    if (cp && cp.value) q.condicao = { pergunta: cp.value, valor: cv ? cv.value : (q.condicao?.valor || "") };
    else q.condicao = null;
  });
}

$("ed-perguntas").addEventListener("input", marcarAlterado);
$("ed-perguntas").addEventListener("change", (ev) => {
  const f = ev.target.dataset.f;
  if (f === "tipo" || f === "cond-pergunta" || f === "opcoes") {
    lerPerguntasDoDom();
    if (f === "cond-pergunta" && ev.target.value) {
      const q = atual.perguntas.find((x) => x.id === ev.target.closest(".eq-q").dataset.id);
      const alvo = atual.perguntas.find((x) => x.id === ev.target.value);
      q.condicao = { pergunta: alvo.id, valor: opcoesDaPergunta(alvo)[0] || "" };
    }
    if (f === "tipo") {
      const q = atual.perguntas.find((x) => x.id === ev.target.closest(".eq-q").dataset.id);
      if (COM_OPCOES.includes(q.tipo) && !q.opcoes.length) q.opcoes = ["Opção 1", "Opção 2"];
    }
    renderPerguntas();
  }
});
$("ed-perguntas").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-q]");
  if (!b) return;
  lerPerguntasDoDom();
  const ps = atual.perguntas;
  const i = ps.findIndex((x) => x.id === b.closest(".eq-q").dataset.id);
  const acao = b.dataset.q;
  if (acao === "subir" && i > 0) [ps[i - 1], ps[i]] = [ps[i], ps[i - 1]];
  if (acao === "descer" && i < ps.length - 1) [ps[i + 1], ps[i]] = [ps[i], ps[i + 1]];
  if (acao === "duplicar") ps.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(ps[i])), id: novoId() });
  if (acao === "remover") {
    const dependentes = ps.filter((x) => x.condicao?.pergunta === ps[i].id);
    if (!confirm("Remover esta pergunta?" + (dependentes.length ? `\n${dependentes.length} pergunta(s) que dependiam dela passarão a aparecer sempre.` : ""))) return;
    dependentes.forEach((x) => (x.condicao = null));
    ps.splice(i, 1);
  }
  // condição só pode apontar para pergunta anterior
  ps.forEach((q, idx) => {
    if (q.condicao && ps.findIndex((x) => x.id === q.condicao.pergunta) >= idx) q.condicao = null;
  });
  marcarAlterado();
  renderPerguntas();
});

function validarEnquete(publicar) {
  if (!atual.titulo) return "Dê um título para a enquete.";
  if (publicar) {
    if (!atual.perguntas.length) return "Adicione pelo menos uma pergunta antes de publicar.";
    const semTitulo = atual.perguntas.findIndex((q) => !q.titulo);
    if (semTitulo >= 0) return `A pergunta ${semTitulo + 1} está sem texto.`;
    const semOp = atual.perguntas.findIndex((q) => COM_OPCOES.includes(q.tipo) && q.opcoes.length < 2);
    if (semOp >= 0) return `A pergunta ${semOp + 1} precisa de pelo menos 2 opções.`;
    if (atual.publico.tipo === "locais" && !atual.publico.locais.length) return "Escolha pelo menos um local de trabalho ou marque todo o efetivo.";
    if (atual.prazo && new Date(atual.prazo) < new Date()) return "O prazo já passou. Ajuste a data ou deixe sem prazo.";
  }
  return null;
}

async function salvar(publicar) {
  lerPerguntasDoDom();
  atual.titulo = $("ed-titulo").value.trim();
  atual.descricao = $("ed-descricao").value.trim();
  atual.prazo = $("ed-prazo").value ? new Date($("ed-prazo").value).toISOString() : null;
  atual.permitir_edicao = $("ed-edicao").checked;
  const erro = validarEnquete(publicar || atual.status === "aberta");
  if (erro) return msg("ed-msg", erro, "erro");

  const registro = {
    titulo: atual.titulo, descricao: atual.descricao || null, prazo: atual.prazo,
    publico: atual.publico, permitir_edicao: atual.permitir_edicao, perguntas: atual.perguntas,
    atualizado_em: new Date().toISOString(),
  };
  if (publicar && atual.status !== "aberta") { registro.status = "aberta"; registro.publicado_em = new Date().toISOString(); }
  msg("ed-msg", "Salvando…");
  const q = atual.id
    ? sb.from("enquetes").update(registro).eq("id", atual.id).select().single()
    : sb.from("enquetes").insert({ ...registro, status: registro.status || "rascunho" }).select().single();
  const { data, error } = await q;
  if (error) return msg("ed-msg", "Erro ao salvar: " + error.message, "erro");
  atual = { ...data, _alterado: false };
  await carregarLista();
  if (publicar) {
    await copiarLink(data.id);
    msg("ed-msg", "Publicada. O link foi copiado.", "ok");
  } else msg("ed-msg", "Salvo.", "ok");
  $("ed-status").textContent = STATUS_ROTULO[data.status];
  $("ed-status").className = "eq-status " + data.status;
  $("ed-titulo-pagina").textContent = "Editar enquete";
  $("btn-publicar").textContent = data.status === "aberta" ? "Salvar alterações" : "Salvar e publicar";
  $("btn-salvar").style.display = data.status === "aberta" ? "none" : "";
}
$("btn-salvar").addEventListener("click", () => salvar(false));
$("btn-publicar").addEventListener("click", () => salvar(true));

/* ---------------- resultados ---------------- */
function textoResposta(q, v) {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.join("; ");
  if (q && q.tipo === "data" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  return String(v);
}

async function abrirResultados(e) {
  rs = { enquete: e, situacao: [], respostas: [] };
  $("rs-titulo").textContent = e.titulo;
  $("rs-status").textContent = STATUS_ROTULO[e.status];
  $("rs-status").className = "eq-status " + e.status;
  $("rs-link").style.display = e.status === "aberta" ? "" : "none";
  $("resumo").innerHTML = `<div class="eq-vazio">Carregando…</div>`;
  mostrar("v-resultados");
  const [{ data: sit, error: e1 }, { data: resp, error: e2 }] = await Promise.all([
    sb.rpc("enquete_situacao", { p_enquete: e.id }),
    sb.from("enquete_respostas").select("*").eq("enquete_id", e.id).order("atualizado_em", { ascending: false }),
  ]);
  if (e1 || e2) { $("resumo").innerHTML = `<div class="eq-vazio">Erro: ${esc((e1 || e2).message)}</div>`; return; }
  rs.situacao = sit || [];
  const porMat = Object.fromEntries(rs.situacao.map((s) => [s.matricula, s]));
  rs.respostas = (resp || []).map((r) => ({ ...r, pessoa: porMat[r.matricula] || { matricula: r.matricula, nome: "(fora do público atual)" } }));

  const total = rs.situacao.length;
  const feitos = rs.situacao.filter((s) => s.respondeu).length;
  $("k-resp").textContent = rs.respostas.length;
  $("k-pend").textContent = total - feitos;
  $("k-pct").textContent = total ? Math.round((feitos / total) * 100) + "%" : "—";

  const locais = [...new Set(rs.situacao.filter((s) => !s.respondeu).map((s) => s.local_trabalho || "Sem local"))];
  $("pd-local").innerHTML = `<option value="">Todos os locais</option>` + locais.map((l) => `<option>${esc(l)}</option>`).join("");
  renderResumo();
  renderTabelaRespostas();
  renderPendentes();
}
$("rs-link").addEventListener("click", (ev) => copiarLink(rs.enquete.id, ev.target));
document.querySelectorAll("[data-sec]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-sec]").forEach((x) => x.classList.toggle("active", x === b));
  document.querySelectorAll(".eq-sec").forEach((s) => s.classList.toggle("ativa", s.id === b.dataset.sec));
}));
$("pd-local").addEventListener("change", renderPendentes);

function renderResumo() {
  const ps = rs.enquete.perguntas || [];
  if (!rs.respostas.length) { $("resumo").innerHTML = `<div class="eq-vazio">Ainda não há respostas.</div>`; return; }
  $("resumo").innerHTML = ps.map((q, i) => {
    const vals = rs.respostas.map((r) => r.respostas?.[q.id]).filter((v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length));
    let corpo;
    if (CONDICIONAIS.includes(q.tipo)) {
      const cont = {};
      opcoesDaPergunta(q).forEach((o) => (cont[o] = 0));
      vals.forEach((v) => (Array.isArray(v) ? v : [v]).forEach((o) => (cont[o] = (cont[o] || 0) + 1)));
      const max = Math.max(1, ...Object.values(cont));
      corpo = Object.entries(cont).map(([o, n]) => `<div class="eq-barra"><span>${esc(o)}</span><span class="t"><i style="width:${(n / max) * 100}%"></i></span><span class="v">${n} · ${vals.length ? Math.round((n / vals.length) * 100) : 0}%</span></div>`).join("");
    } else if (q.tipo === "numero") {
      const nums = vals.map(Number).filter((n) => !isNaN(n));
      const soma = nums.reduce((a, b) => a + b, 0);
      corpo = nums.length ? `<div class="eq-prog">Média <b>${(soma / nums.length).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</b> · menor <b>${Math.min(...nums)}</b> · maior <b>${Math.max(...nums)}</b> · soma <b>${soma.toLocaleString("pt-BR")}</b></div>` : "";
    } else {
      corpo = `<div class="eq-textos">${vals.slice(0, 50).map((v) => `<div>${esc(textoResposta(q, v))}</div>`).join("")}${vals.length > 50 ? `<div>… e mais ${vals.length - 50} na aba Respostas</div>` : ""}</div>`;
    }
    return `<div class="eq-card eq-resumo-q"><h4>${i + 1}. ${esc(q.titulo)}</h4><div class="eq-msg" style="margin-bottom:8px;">${vals.length} resposta(s)</div>${corpo || ""}</div>`;
  }).join("");
}

function linhasRespostas() {
  const ps = rs.enquete.perguntas || [];
  const cab = ["Matrícula", "Posto", "Nome", "Local de trabalho", "Enviado em", ...ps.map((q, i) => `${i + 1}. ${q.titulo}`)];
  const linhas = rs.respostas.map((r) => [
    r.matricula, r.pessoa.posto || "", r.pessoa.nome || "", r.pessoa.local_trabalho || "", fmtData(r.atualizado_em),
    ...ps.map((q) => textoResposta(q, r.respostas?.[q.id])),
  ]);
  return { cab, linhas };
}
function linhasPendentes() {
  const f = $("pd-local").value;
  const cab = ["Local de trabalho", "Matrícula", "Posto", "Nome", "Função"];
  const linhas = rs.situacao.filter((s) => !s.respondeu && (!f || (s.local_trabalho || "Sem local") === f))
    .map((s) => [s.local_trabalho || "Sem local", s.matricula, s.posto || "", s.nome || "", s.funcao || ""]);
  return { cab, linhas };
}

function renderTabelaRespostas() {
  const { cab, linhas } = linhasRespostas();
  if (!linhas.length) { $("t-respostas").innerHTML = `<tr><td>Ainda não há respostas.</td></tr>`; return; }
  $("t-respostas").innerHTML = `<thead><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join("")}${window.podeEditar ? "<th></th>" : ""}</tr></thead><tbody>` +
    linhas.map((l, i) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join("")}${window.podeEditar ? `<td><button class="eq-ico perigo" data-apagar="${rs.respostas[i].id}" title="Apagar esta resposta">✕</button></td>` : ""}</tr>`).join("") + "</tbody>";
}
$("t-respostas").addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-apagar]");
  if (!b) return;
  const r = rs.respostas.find((x) => String(x.id) === b.dataset.apagar);
  if (!confirm(`Apagar a resposta de ${r.pessoa.nome || r.matricula}? Ele voltará para a lista de quem falta.`)) return;
  const { error } = await sb.from("enquete_respostas").delete().eq("id", r.id);
  if (error) return alert("Não foi possível apagar: " + error.message);
  abrirResultados(rs.enquete);
});

function renderPendentes() {
  const { linhas } = linhasPendentes();
  if (!linhas.length) { $("t-pendentes").innerHTML = `<tr><td>${rs.situacao.length ? "Todos responderam." : "Nenhum policial no público desta enquete."}</td></tr>`; return; }
  let ultimo = null;
  $("t-pendentes").innerHTML = `<thead><tr><th>Matrícula</th><th>Posto</th><th>Nome</th><th>Função</th></tr></thead><tbody>` +
    linhas.map((l) => {
      const grupo = l[0] !== ultimo ? `<tr class="grupo"><td colspan="4">${esc(l[0])} — ${linhas.filter((x) => x[0] === l[0]).length}</td></tr>` : "";
      ultimo = l[0];
      return grupo + `<tr><td>${esc(l[1])}</td><td>${esc(l[2])}</td><td>${esc(l[3])}</td><td>${esc(l[4])}</td></tr>`;
    }).join("") + "</tbody>";
}

/* ---------------- exportação ---------------- */
function carregarScript(src) {
  return new Promise((ok, falha) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => falha(new Error("Não foi possível carregar " + src));
    document.head.appendChild(s);
  });
}
function nomeArquivo(sufixo, ext) {
  const base = (rs.enquete.titulo || "enquete").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${base}-${sufixo}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}
function baixar(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportarCSV(cab, linhas, nome) {
  const cel = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cab, ...linhas].map((l) => l.map(cel).join(";")).join("\r\n");
  baixar(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), nome);
}
async function exportarXLSX(abas, nome) {
  await carregarScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
  const wb = XLSX.utils.book_new();
  abas.forEach(({ titulo, cab, linhas }) => {
    const ws = XLSX.utils.aoa_to_sheet([cab, ...linhas]);
    ws["!cols"] = cab.map((c, i) => ({ wch: Math.min(50, Math.max(10, c.length, ...linhas.map((l) => String(l[i] ?? "").length))) }));
    XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 31));
  });
  XLSX.writeFile(wb, nome);
}
async function novoPDF() {
  await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(rs.enquete.titulo, 40, 48, { maxWidth: 515 });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(`CIPE Sudoeste — SRHS · gerado em ${new Date().toLocaleString("pt-BR")} · ${$("k-resp").textContent} resposta(s), ${$("k-pend").textContent} pendente(s)`, 40, 64);
  doc.setTextColor(0);
  return doc;
}
const estiloTabela = { styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak" }, headStyles: { fillColor: [58, 64, 48] }, margin: { left: 40, right: 40 } };

async function exportarPDFRespostas() {
  const doc = await novoPDF();
  const ps = rs.enquete.perguntas || [];
  let y = 84;
  if (!rs.respostas.length) doc.text("Nenhuma resposta.", 40, y);
  rs.respostas.forEach((r, idx) => {
    doc.autoTable({
      ...estiloTabela, startY: idx === 0 ? y : doc.lastAutoTable.finalY + 16,
      head: [[{ content: `${r.pessoa.posto || ""} ${r.pessoa.nome || ""} — ${r.matricula}   (${r.pessoa.local_trabalho || "sem local"} · ${fmtData(r.atualizado_em)})`, colSpan: 2 }]],
      body: ps.map((q, i) => [`${i + 1}. ${q.titulo}`, textoResposta(q, r.respostas?.[q.id]) || "—"]),
      columnStyles: { 0: { cellWidth: 220, textColor: 90 } }, pageBreak: "auto", rowPageBreak: "avoid",
    });
  });
  doc.save(nomeArquivo("respostas", "pdf"));
}
async function exportarPDFPendentes() {
  const doc = await novoPDF();
  const { cab, linhas } = linhasPendentes();
  doc.setFontSize(11); doc.text(`Quem falta responder${$("pd-local").value ? " — " + $("pd-local").value : ""}`, 40, 84);
  doc.autoTable({ ...estiloTabela, startY: 94, head: [cab], body: linhas.length ? linhas : [["Todos responderam.", "", "", "", ""]] });
  doc.save(nomeArquivo("pendentes", "pdf"));
}

document.querySelectorAll("[data-exp]").forEach((b) => b.addEventListener("click", async () => {
  const t = b.textContent; b.disabled = true; b.textContent = "Gerando…";
  try {
    const r = linhasRespostas(), p = linhasPendentes();
    switch (b.dataset.exp) {
      case "respostas-csv": exportarCSV(r.cab, r.linhas, nomeArquivo("respostas", "csv")); break;
      case "respostas-xlsx": await exportarXLSX([{ titulo: "Respostas", ...r }, { titulo: "Quem falta", ...p }], nomeArquivo("respostas", "xlsx")); break;
      case "respostas-pdf": await exportarPDFRespostas(); break;
      case "pendentes-csv": exportarCSV(p.cab, p.linhas, nomeArquivo("pendentes", "csv")); break;
      case "pendentes-xlsx": await exportarXLSX([{ titulo: "Quem falta", ...p }], nomeArquivo("pendentes", "xlsx")); break;
      case "pendentes-pdf": await exportarPDFPendentes(); break;
    }
  } catch (e) { console.error(e); alert("Não foi possível gerar o arquivo: " + e.message); }
  b.disabled = false; b.textContent = t;
}));

/* ---------------- início ---------------- */
async function iniciar() {
  sb = window.sbAuth;
  if (!window.podeEditar) $("btn-nova").style.display = "none";
  await Promise.all([carregarLista(), carregarEfetivo()]);
}
window.authPronto ? iniciar() : document.addEventListener("auth-pronto", iniciar, { once: true });
window.addEventListener("beforeunload", (ev) => {
  if (document.getElementById("v-editor").classList.contains("ativa") && atual && atual._alterado) { ev.preventDefault(); ev.returnValue = ""; }
});
