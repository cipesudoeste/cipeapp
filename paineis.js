/* ============================================================
   PAINÉIS — construtor de dashboards (Efetivo, Cadastros, Ofícios,
   Viaturas, WhatsApp). Cada widget chama painel_consultar() no banco,
   que já aplica a permissão da fonte e devolve {chave, valor}[].
   ============================================================ */

const FONTES = {
  efetivo: { label: "Efetivo", campos: [
    ["posto", "Posto"], ["local_trabalho", "Local de trabalho"], ["funcao", "Função"],
    ["gh", "GH"], ["reserva_pedida", "Pediu reserva"], ["tem_email", "Tem e-mail"], ["tem_telefone", "Tem telefone"],
  ]},
  ferias: { label: "Férias", campos: [
    ["situacao", "Situação (agendada/em gozo/concluída)"], ["mes_inicio", "Mês de início"], ["local_trabalho", "Local de trabalho"],
  ]},
  cadastros: { label: "Cadastros (Atualização Cadastral)", campos: [
    ["pendencia", "Pendência apontada"], ["curso", "Curso pela PM"], ["local_trabalho", "Local de trabalho"],
    ["possui_identidade", "Possui identidade funcional"], ["identidade_ilegivel", "Identidade ilegível/danificada"], ["possui_cnh", "Possui CNH cadastrada"],
  ]},
  oficios: { label: "Ofícios", campos: [
    ["status", "Status"], ["modalidade", "Modalidade da audiência"], ["comarca", "Comarca"], ["mes_audiencia", "Mês da audiência"],
  ]},
  viaturas: { label: "Viaturas", campos: [
    ["status", "Status"], ["categoria", "Categoria"], ["tipo", "Tipo"],
  ]},
  whatsapp_mensagens: { label: "WhatsApp · Mensagens", campos: [
    ["direcao", "Direção"], ["status", "Status de entrega"], ["tipo", "Tipo"], ["mes", "Mês"],
  ]},
  whatsapp_contatos: { label: "WhatsApp · Contatos", campos: [
    ["opt_in", "Aceitou receber mensagens"], ["tem_matricula", "Vinculado a uma matrícula"], ["mes_cadastro", "Mês de cadastro"],
  ]},
};
const TIPOS_GRAFICO = [
  ["barra", "Barras", '<rect x="3" y="10" width="4" height="10"/><rect x="10" y="5" width="4" height="15"/><rect x="17" y="13" width="4" height="7"/>'],
  ["pizza", "Pizza", '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l7 4"/>'],
  ["rosca", "Rosca", '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'],
  ["linha", "Linha", '<path d="M3 17l5-6 4 3 8-9"/>'],
  ["numero", "Número", '<text x="12" y="16" font-size="11" text-anchor="middle" fill="currentColor" stroke="none">123</text>'],
  ["tabela", "Tabela", '<rect x="3" y="4" width="18" height="16"/><path d="M3 10h18M9 4v16"/>'],
  ["mapa", "Mapa por local", '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>'],
];
const OPERADORES = [["igual", "é igual a"], ["diferente", "é diferente de"], ["contem", "contém"], ["preenchido", "está preenchido"], ["vazio", "está vazio"]];
const CORES = ["#bfae8c", "#9fd08a", "#8ab4d0", "#d0a08a", "#c9a2d0", "#d0c98a", "#8ad0c0", "#e08a72"];

let sb = null;
let paineis = [];
let painelAtual = null;   // registro completo do painel aberto
let modoEdicao = false;
let novoWidget = null;    // rascunho em construção
let efetivoBusca = [];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : "w" + Date.now() + Math.random().toString(16).slice(2));

function mostrar(v) { document.querySelectorAll(".eq-view").forEach((x) => x.classList.toggle("ativa", x.id === v)); window.scrollTo({ top: 0 }); }

/* ---------------- lista ---------------- */
async function carregarLista() {
  const { data, error } = await sb.rpc("paineis_resumo");
  if (error) { $("lista").innerHTML = `<div class="eq-vazio">Erro ao carregar: ${esc(error.message)}</div>`; return; }
  paineis = data || [];
  renderLista();
}
function renderLista() {
  if (!paineis.length) {
    $("lista").innerHTML = `<div class="eq-vazio">Nenhum painel ainda.${window.podeEditar ? "<br>Clique em <b>Novo painel</b> para montar o primeiro." : ""}</div>`;
    return;
  }
  $("lista").innerHTML = paineis.map((p) => `<div class="pn-card" data-id="${p.id}">
    <h3>${p.atalho_rapido ? '<span class="pn-star">★</span>' : ""}${esc(p.titulo)}</h3>
    <p>${esc(p.descricao || "")}</p>
    <div class="pn-meta"><span>${p.meu_nivel === "editar" ? "você edita" : "você consulta"}</span>${p.compartilhado_com ? `<span>compartilhado com ${p.compartilhado_com}</span>` : ""}</div>
  </div>`).join("");
}
$("lista").addEventListener("click", (ev) => {
  const c = ev.target.closest(".pn-card");
  if (c) abrirPainel(c.dataset.id);
});
$("btn-voltar").addEventListener("click", () => { mostrar("v-lista"); carregarLista(); });

$("btn-novo-painel").addEventListener("click", async () => {
  const titulo = prompt("Nome do novo painel:");
  if (!titulo || !titulo.trim()) return;
  const { data, error } = await sb.from("paineis").insert({ titulo: titulo.trim(), widgets: [], filtros_globais: [] }).select().single();
  if (error) return alert("Não foi possível criar: " + error.message);
  await carregarLista();
  abrirPainel(data.id);
});

/* ---------------- abrir painel ---------------- */
async function abrirPainel(id) {
  const { data, error } = await sb.from("paineis").select("*").eq("id", id).single();
  if (error) return alert("Não foi possível abrir: " + error.message);
  painelAtual = data;
  const resumo = paineis.find((p) => p.id === id);
  modoEdicao = false;
  $("chk-editar").checked = false;
  $("chk-editar").parentElement.hidden = !(resumo && resumo.meu_nivel === "editar");
  ["compartilhar", "editar-painel", "excluir-painel"].forEach((a) =>
    document.querySelector(`[data-acao="${a}"]`).hidden = !(resumo && resumo.meu_nivel === "editar"));
  $("pn-titulo").textContent = data.titulo;
  $("pn-desc").textContent = data.descricao || "";
  novoWidget = null;
  mostrar("v-painel");
  renderFiltrosGlobais();
  renderBuilderSlot();
  await renderWidgets();
}
$("chk-editar").addEventListener("change", (e) => { modoEdicao = e.target.checked; renderBuilderSlot(); renderWidgets(); });

document.querySelector('[data-acao="editar-painel"]').addEventListener("click", async () => {
  const t = prompt("Novo nome do painel:", painelAtual.titulo);
  if (t === null) return;
  const d = prompt("Descrição curta (opcional):", painelAtual.descricao || "") || "";
  const atalho = confirm("Marcar como atalho rápido (aparece primeiro na lista)?\nOK = sim, Cancelar = não.");
  const { error } = await sb.from("paineis").update({ titulo: t.trim() || painelAtual.titulo, descricao: d, atalho_rapido: atalho, atualizado_em: new Date().toISOString() }).eq("id", painelAtual.id);
  if (error) return alert("Erro: " + error.message);
  painelAtual.titulo = t.trim() || painelAtual.titulo; painelAtual.descricao = d; painelAtual.atalho_rapido = atalho;
  $("pn-titulo").textContent = painelAtual.titulo; $("pn-desc").textContent = d;
});
document.querySelector('[data-acao="excluir-painel"]').addEventListener("click", async () => {
  if (prompt(`Para excluir "${painelAtual.titulo}", digite EXCLUIR:`) !== "EXCLUIR") return;
  const { error } = await sb.from("paineis").delete().eq("id", painelAtual.id);
  if (error) return alert("Erro: " + error.message);
  mostrar("v-lista"); carregarLista();
});

/* ---------------- filtros globais (aplicam a todos os widgets) ---------------- */
function todosOsCampos() {
  const vistos = new Map();
  Object.values(FONTES).forEach((f) => f.campos.forEach(([v, l]) => { if (!vistos.has(v)) vistos.set(v, l); }));
  return [...vistos.entries()];
}
function renderFiltrosGlobais() {
  const gf = painelAtual.filtros_globais || [];
  const campos = todosOsCampos();
  $("pn-filtros-globais").innerHTML =
    gf.map((f, i) => `<span class="fchip">${esc(campos.find((c) => c[0] === f.campo)?.[1] || f.campo)} ${esc(OPERADORES.find((o) => o[0] === f.operador)?.[1] || "")} ${esc(f.valor || "")}${modoEdicao ? `<button type="button" data-rm-gf="${i}">✕</button>` : ""}</span>`).join("") +
    (modoEdicao ? `<button type="button" class="ef-btn" id="btn-add-gf">+ Filtro geral</button>` : (gf.length ? "" : `<span class="eq-msg">Sem filtros gerais.</span>`));
  if (modoEdicao) {
    $("btn-add-gf")?.addEventListener("click", () => {
      const campo = prompt("Filtrar por qual campo? (" + campos.map((c) => c[0]).join(", ") + ")");
      if (!campo || !campos.some((c) => c[0] === campo)) return campo && alert("Campo não reconhecido.");
      const valor = prompt("Igual a qual valor?");
      if (valor === null) return;
      painelAtual.filtros_globais = [...gf, { campo, operador: "igual", valor }];
      salvarPainel().then(() => { renderFiltrosGlobais(); renderWidgets(); });
    });
  }
  $("pn-filtros-globais").querySelectorAll("[data-rm-gf]").forEach((b) => b.addEventListener("click", () => {
    painelAtual.filtros_globais = gf.filter((_, i) => i !== +b.dataset.rmGf);
    salvarPainel().then(() => { renderFiltrosGlobais(); renderWidgets(); });
  }));
}

async function salvarPainel() {
  const { error } = await sb.from("paineis").update({
    widgets: painelAtual.widgets, filtros_globais: painelAtual.filtros_globais, atualizado_em: new Date().toISOString(),
  }).eq("id", painelAtual.id);
  if (error) alert("Não foi possível salvar: " + error.message);
}

/* ---------------- widgets: renderização ---------------- */
async function renderWidgets() {
  const ws = painelAtual.widgets || [];
  if (!ws.length && !modoEdicao) { $("pn-widgets").innerHTML = `<div class="eq-vazio">Este painel ainda não tem gráficos.</div>`; return; }
  $("pn-widgets").innerHTML = ws.map((w) => `<div class="pn-widget ${w.tipo_grafico === "tabela" || w.tipo_grafico === "mapa" ? "tam-2" : ""}" data-id="${w.id}">
    <div class="pn-widget-head"><h4>${esc(w.titulo)}</h4>
      ${modoEdicao ? `<button type="button" class="eq-ico perigo" data-rm-widget="${w.id}" title="Remover">✕</button>` : ""}
    </div>
    <div class="pn-widget-corpo" id="corpo-${w.id}"><div class="pn-vazio-mini">Carregando…</div></div>
  </div>`).join("") + (modoEdicao ? `<div class="pn-add" id="pn-add-slot">+ Adicionar gráfico</div>` : "");
  $("pn-widgets").querySelectorAll("[data-rm-widget]").forEach((b) => b.addEventListener("click", async () => {
    painelAtual.widgets = painelAtual.widgets.filter((w) => w.id !== b.dataset.rmWidget);
    await salvarPainel(); renderWidgets();
  }));
  $("pn-add-slot")?.addEventListener("click", () => { novoWidget = rascunhoVazio(); renderBuilderSlot(); document.getElementById("pn-builder-slot").scrollIntoView({ behavior: "smooth" }); });
  ws.forEach(carregarWidget);
}
async function carregarWidget(w) {
  const filtros = [...(painelAtual.filtros_globais || []), ...(w.filtros || [])];
  const { data, error } = await sb.rpc("painel_consultar", { p_fonte: w.fonte, p_agrupar_por: w.agrupar_por, p_filtros: filtros });
  const corpo = document.getElementById("corpo-" + w.id);
  if (!corpo) return;
  if (error) { corpo.innerHTML = `<div class="pn-vazio-mini">${esc(error.message)}</div>`; return; }
  desenharGrafico(corpo, w.tipo_grafico, data || [], w);
}

function desenharGrafico(el, tipo, dados, w) {
  if (!dados.length) { el.innerHTML = `<div class="pn-vazio-mini">Sem dados para este gráfico.</div>`; return; }
  if (tipo === "numero") {
    const total = dados.reduce((s, d) => s + d.valor, 0);
    el.innerHTML = `<div class="pn-num"><div class="n">${total.toLocaleString("pt-BR")}</div><div class="l">${esc(w.subtitulo || "total")}</div></div>`;
    return;
  }
  if (tipo === "barra") {
    const max = Math.max(...dados.map((d) => d.valor), 1);
    el.innerHTML = `<div class="pn-barras">` + dados.slice(0, 12).map((d) =>
      `<div class="linha"><span title="${esc(d.chave)}">${esc(d.chave)}</span><span class="t"><i style="width:${(d.valor / max) * 100}%"></i></span><span class="v">${d.valor}</span></div>`).join("") + `</div>`;
    return;
  }
  if (tipo === "tabela") {
    el.innerHTML = `<table class="pn-tabela">` + dados.map((d) => `<tr><td>${esc(d.chave)}</td><td>${d.valor}</td></tr>`).join("") + `</table>`;
    return;
  }
  if (tipo === "mapa") {
    const max = Math.max(...dados.map((d) => d.valor), 1);
    el.innerHTML = `<div class="pn-mapa">` + dados.map((d) => {
      const pct = d.valor / max;
      const cor = `rgba(191,174,140,${0.15 + pct * 0.55})`;
      return `<div class="tile" style="background:${cor};"><b>${d.valor}</b><span>${esc(d.chave)}</span></div>`;
    }).join("") + `</div>`;
    return;
  }
  if (tipo === "linha") {
    const ord = [...dados].sort((a, b) => (a.chave > b.chave ? 1 : -1));
    const max = Math.max(...ord.map((d) => d.valor), 1);
    const w2 = 280, h = 110, pad = 10;
    const pts = ord.map((d, i) => [pad + (i * (w2 - 2 * pad)) / Math.max(1, ord.length - 1), h - pad - (d.valor / max) * (h - 2 * pad)]);
    const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
    el.innerHTML = `<svg viewBox="0 0 ${w2} ${h}" style="width:100%;height:120px;"><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.4" fill="var(--accent)"/>`).join("")}</svg>
      <div class="pn-legenda">${ord.map((d) => `<span>${esc(d.chave)}: <b>${d.valor}</b></span>`).join("")}</div>`;
    return;
  }
  if (tipo === "pizza" || tipo === "rosca") {
    const total = dados.reduce((s, d) => s + d.valor, 0) || 1;
    const cx = 60, cy = 60, r = 52, rInterno = tipo === "rosca" ? 28 : 0;
    let ang = -Math.PI / 2, path = "";
    const fatias = dados.slice(0, 8);
    fatias.forEach((d, i) => {
      const frac = d.valor / total;
      const ang2 = ang + frac * 2 * Math.PI;
      const [x1, y1] = [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
      const [x2, y2] = [cx + r * Math.cos(ang2), cy + r * Math.sin(ang2)];
      const largo = ang2 - ang > Math.PI ? 1 : 0;
      path += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largo} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${CORES[i % CORES.length]}"/>`;
      ang = ang2;
    });
    el.innerHTML = `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;">
      <svg viewBox="0 0 120 120" style="width:120px;height:120px;flex:none;">${path}${rInterno ? `<circle cx="${cx}" cy="${cy}" r="${rInterno}" fill="var(--bg-panel)"/>` : ""}</svg>
      <div class="pn-legenda" style="flex-direction:column;align-items:flex-start;">${fatias.map((d, i) => `<span><i style="background:${CORES[i % CORES.length]}"></i>${esc(d.chave)} — ${d.valor} (${Math.round((d.valor / total) * 100)}%)</span>`).join("")}</div>
    </div>`;
    return;
  }
}

/* ---------------- construtor de widget ---------------- */
function rascunhoVazio() { return { id: novoId(), titulo: "", fonte: "", agrupar_por: "", tipo_grafico: "barra", filtros: [] }; }
function renderBuilderSlot() {
  const slot = $("pn-builder-slot");
  if (!modoEdicao || !novoWidget) { slot.innerHTML = ""; return; }
  const w = novoWidget;
  const camposFonte = w.fonte ? FONTES[w.fonte].campos : [];
  slot.innerHTML = `<div class="pn-builder">
    <h3>Novo gráfico</h3>
    <div class="pn-step dois">
      <div><label class="eq-lbl">Título</label><input class="eq-in" id="nw-titulo" placeholder="Ex.: Efetivo por posto" value="${esc(w.titulo)}"></div>
      <div><label class="eq-lbl">Fonte de dados</label>
        <select class="eq-in" id="nw-fonte"><option value="">Selecione</option>
          ${Object.entries(FONTES).map(([k, f]) => `<option value="${k}" ${w.fonte === k ? "selected" : ""}>${f.label}</option>`).join("")}
        </select>
      </div>
    </div>
    ${w.fonte ? `<div class="pn-step">
      <div><label class="eq-lbl">Agrupar por</label>
        <select class="eq-in" id="nw-campo"><option value="">Selecione</option>
          ${camposFonte.map(([v, l]) => `<option value="${v}" ${w.agrupar_por === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
    </div>` : ""}
    <label class="eq-lbl">Tipo de gráfico</label>
    <div class="pn-tipos">${TIPOS_GRAFICO.map(([k, l, svg]) => `<div class="pn-tipo-btn ${w.tipo_grafico === k ? "on" : ""}" data-tipo="${k}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${svg}</svg>${l}</div>`).join("")}</div>

    <label class="eq-lbl" style="margin-top:12px;display:block;">Filtros só deste gráfico (opcional)</label>
    <div id="nw-filtros">${w.filtros.map((f, i) => filtroRowHtml(f, i, camposFonte)).join("")}</div>
    ${w.fonte ? `<button type="button" class="ef-btn" id="nw-add-filtro" style="margin-top:4px;">+ Filtro</button>` : ""}

    <div class="pn-preview" id="nw-preview"><div class="pn-vazio-mini">Escolha a fonte e o agrupamento para pré-visualizar.</div></div>

    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
      <button type="button" class="ef-btn" id="nw-cancelar">Cancelar</button>
      <button type="button" class="ef-btn primary" id="nw-salvar">Adicionar ao painel</button>
    </div>
  </div>`;

  $("nw-titulo").addEventListener("input", (e) => (w.titulo = e.target.value));
  $("nw-fonte").addEventListener("change", (e) => { w.fonte = e.target.value; w.agrupar_por = ""; w.filtros = []; renderBuilderSlot(); });
  document.getElementById("nw-campo")?.addEventListener("change", (e) => { w.agrupar_por = e.target.value; preVisualizar(); });
  document.querySelectorAll("[data-tipo]").forEach((b) => b.addEventListener("click", () => { w.tipo_grafico = b.dataset.tipo; renderBuilderSlot(); preVisualizar(); }));
  document.getElementById("nw-add-filtro")?.addEventListener("click", () => { w.filtros.push({ campo: camposFonte[0][0], operador: "igual", valor: "" }); renderBuilderSlot(); });
  ligarFiltroRows(w, camposFonte);
  $("nw-cancelar").addEventListener("click", () => { novoWidget = null; renderBuilderSlot(); });
  $("nw-salvar").addEventListener("click", async () => {
    if (!w.fonte || !w.agrupar_por) return alert("Escolha a fonte e o campo de agrupamento.");
    if (!w.titulo.trim()) w.titulo = FONTES[w.fonte].campos.find((c) => c[0] === w.agrupar_por)?.[1] || "Gráfico";
    painelAtual.widgets = [...(painelAtual.widgets || []), w];
    await salvarPainel();
    novoWidget = null;
    renderBuilderSlot();
    renderWidgets();
  });
  if (w.fonte && w.agrupar_por) preVisualizar();
}
function filtroRowHtml(f, i, camposFonte) {
  return `<div class="pn-filtro-row" data-i="${i}">
    <select class="eq-in" data-f="campo">${camposFonte.map(([v, l]) => `<option value="${v}" ${f.campo === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <select class="eq-in" data-f="operador">${OPERADORES.map(([v, l]) => `<option value="${v}" ${f.operador === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <input class="eq-in" data-f="valor" placeholder="Valor" value="${esc(f.valor)}" ${["preenchido", "vazio"].includes(f.operador) ? "disabled" : ""}>
    <button type="button" class="eq-ico perigo" data-rm-filtro="${i}">✕</button>
  </div>`;
}
function ligarFiltroRows(w, camposFonte) {
  document.querySelectorAll(".pn-filtro-row").forEach((row) => {
    const i = +row.dataset.i;
    row.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("change", () => {
      w.filtros[i][el.dataset.f] = el.value;
      if (el.dataset.f === "operador") renderBuilderSlot();
      else preVisualizar();
    }));
  });
  document.querySelectorAll("[data-rm-filtro]").forEach((b) => b.addEventListener("click", () => { w.filtros.splice(+b.dataset.rmFiltro, 1); renderBuilderSlot(); preVisualizar(); }));
}
async function preVisualizar() {
  const w = novoWidget;
  const box = $("nw-preview");
  if (!w.fonte || !w.agrupar_por) return;
  box.innerHTML = `<div class="pn-vazio-mini">Carregando pré-visualização…</div>`;
  const filtros = [...(painelAtual.filtros_globais || []), ...w.filtros.filter((f) => f.valor || ["preenchido", "vazio"].includes(f.operador))];
  const { data, error } = await sb.rpc("painel_consultar", { p_fonte: w.fonte, p_agrupar_por: w.agrupar_por, p_filtros: filtros });
  if (error) { box.innerHTML = `<div class="pn-vazio-mini">${esc(error.message)}</div>`; return; }
  desenharGrafico(box, w.tipo_grafico, data || [], w);
}

/* ---------------- compartilhar ---------------- */
document.querySelector('[data-acao="compartilhar"]').addEventListener("click", abrirCompartilhar);
async function abrirCompartilhar() {
  const { data: acessos } = await sb.from("painel_acessos").select("*").eq("painel_id", painelAtual.id);
  if (!efetivoBusca.length) { const { data } = await sb.from("admins").select("email, nome, papel"); efetivoBusca = data || []; }
  const html = `<div class="pn-builder">
    <h3>Compartilhar "${esc(painelAtual.titulo)}"</h3>
    <p class="eq-msg">Além de quem criou o painel${painelAtual.criado_por ? " (" + esc(painelAtual.criado_por) + ")" : ""} e dos masters, só quem estiver nesta lista acessa.</p>
    <div class="pn-step dois">
      <select class="eq-in" id="sh-email"><option value="">Escolher administrador…</option>
        ${efetivoBusca.filter((a) => a.papel !== "master").map((a) => `<option value="${a.email}">${esc(a.nome || a.email)} (${esc(a.email)})</option>`).join("")}
      </select>
      <select class="eq-in" id="sh-nivel"><option value="ver">Pode ver</option><option value="editar">Pode editar</option></select>
    </div>
    <button type="button" class="ef-btn primary" id="sh-add" style="margin-bottom:14px;">Adicionar</button>
    <div id="sh-lista"></div>
    <div style="text-align:right;margin-top:12px;"><button type="button" class="ef-btn" id="sh-fechar">Fechar</button></div>
  </div>`;
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:999;padding:16px;";
  overlay.innerHTML = `<div style="max-width:480px;width:100%;max-height:85vh;overflow:auto;">${html}</div>`;
  document.body.appendChild(overlay);
  const renderShLista = (lista) => {
    $("sh-lista").innerHTML = lista.length ? lista.map((a) => `<div class="pn-share-row"><span class="email">${esc(a.email)}</span><span>${a.nivel === "editar" ? "edita" : "vê"}</span><button type="button" class="eq-ico perigo" data-rm-share="${esc(a.email)}">✕</button></div>`).join("")
      : `<div class="eq-msg">Ninguém adicionado ainda.</div>`;
    $("sh-lista").querySelectorAll("[data-rm-share]").forEach((b) => b.addEventListener("click", async () => {
      await sb.from("painel_acessos").delete().eq("painel_id", painelAtual.id).eq("email", b.dataset.rmShare);
      abrirCompartilhar(); overlay.remove();
    }));
  };
  renderShLista(acessos || []);
  $("sh-add").addEventListener("click", async () => {
    const email = $("sh-email").value, nivel = $("sh-nivel").value;
    if (!email) return;
    const { error } = await sb.from("painel_acessos").upsert({ painel_id: painelAtual.id, email, nivel });
    if (error) return alert("Erro: " + error.message);
    overlay.remove(); abrirCompartilhar();
  });
  $("sh-fechar").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

/* ---------------- início ---------------- */
async function iniciar() {
  sb = window.sbAuth;
  await carregarLista();
}
window.authPronto ? iniciar() : document.addEventListener("auth-pronto", iniciar, { once: true });
