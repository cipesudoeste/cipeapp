/* ============================================================
   RODADAS DE ATUALIZAÇÃO CADASTRAL — quem já atualizou / quem falta
   Uma rodada conta os envios do formulario.html feitos a partir
   da data de início (até ser encerrada).
   ============================================================ */
let sb = null;
let rodadas = [];
let resumo = {};
let efetivo = [];
let locaisEfetivo = [];
let editando = null;           // rodada em edição (null = nova)
let publicoForm = { tipo: "todos" };
let ac = { rodada: null, sit: [] };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const fmtDia = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
const linkFormulario = () => new URL("formulario.html", location.href).href;

function situacao(r) {
  if (r.encerrada_em) return { cls: "encerrada", txt: "Encerrada" };
  if (new Date(r.inicio) > new Date()) return { cls: "rascunho", txt: "Agendada" };
  if (r.prazo && new Date(r.prazo) < new Date()) return { cls: "encerrada", txt: "Prazo vencido" };
  return { cls: "aberta", txt: "Em andamento" };
}
function mostrar(v) {
  document.querySelectorAll(".eq-view").forEach((x) => x.classList.toggle("ativa", x.id === v));
  window.scrollTo({ top: 0 });
}
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function copiar(texto, btn) {
  try { await navigator.clipboard.writeText(texto); } catch { prompt("Copie:", texto); return; }
  if (btn) { const t = btn.textContent; btn.textContent = "Copiado"; setTimeout(() => (btn.textContent = t), 1500); }
}

/* ---------------- lista ---------------- */
async function carregar() {
  const [{ data, error }, { data: res }] = await Promise.all([
    sb.from("atualizacao_rodadas").select("*").order("inicio", { ascending: false }),
    sb.rpc("rodadas_resumo"),
  ]);
  if (error) { $("lista").innerHTML = `<div class="eq-vazio">Erro ao carregar: ${esc(error.message)}</div>`; return; }
  rodadas = data || [];
  resumo = {};
  (res || []).forEach((r) => (resumo[r.rodada_id] = r));
  renderLista();
}

function renderLista() {
  if (!rodadas.length) {
    $("lista").innerHTML = `<div class="eq-vazio">Nenhuma rodada criada.${window.podeEditar ? "<br>Clique em <b>Nova rodada</b> quando for pedir a atualização ao efetivo." : ""}</div>`;
    return;
  }
  $("lista").innerHTML = rodadas.map((r) => {
    const s = situacao(r);
    const x = resumo[r.id] || { publico: 0, atualizados: 0 };
    const pct = x.publico ? Math.round((x.atualizados / x.publico) * 100) : 0;
    const acoes = window.podeEditar ? `
      <button type="button" class="ef-btn" data-acao="editar" data-id="${r.id}">Editar</button>
      ${r.encerrada_em
        ? `<button type="button" class="ef-btn" data-acao="reabrir" data-id="${r.id}">Reabrir</button>`
        : `<button type="button" class="ef-btn" data-acao="encerrar" data-id="${r.id}">Encerrar</button>`}
      <button type="button" class="ef-btn" data-acao="excluir" data-id="${r.id}">Excluir</button>` : "";
    return `<div class="eq-item">
      <div>
        <h3>${esc(r.titulo)}</h3>
        <div class="eq-meta">
          <span class="eq-status ${s.cls}">${s.txt}</span>
          <span>Desde ${fmtDia(r.inicio)}</span>
          ${r.prazo ? `<span>Prazo: ${fmt(r.prazo)}</span>` : ""}
          ${r.encerrada_em ? `<span>Encerrada em ${fmtDia(r.encerrada_em)}</span>` : ""}
          <span>${r.publico?.tipo === "locais" ? esc((r.publico.locais || []).join(", ")) : "Todo o efetivo"}</span>
        </div>
        ${r.observacao ? `<div class="rd-tag" style="margin-top:4px;">${esc(r.observacao)}</div>` : ""}
      </div>
      <div class="eq-prog"><b>${x.atualizados}</b> de <b>${x.publico}</b> atualizaram (${pct}%)<div class="eq-bar"><i style="width:${pct}%"></i></div></div>
      <div class="eq-acoes">
        <button type="button" class="ef-btn primary" data-acao="acompanhar" data-id="${r.id}">Acompanhar</button>
        ${acoes}
      </div>
    </div>`;
  }).join("");
}

$("lista").addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-acao]");
  if (!b) return;
  const r = rodadas.find((x) => x.id === b.dataset.id);
  const acao = b.dataset.acao;
  if (acao === "acompanhar") return abrirAcompanhamento(r);
  if (acao === "editar") return abrirForm(r);
  if (acao === "encerrar" || acao === "reabrir") {
    if (acao === "encerrar" && !confirm(`Encerrar "${r.titulo}"? Envios feitos depois disso não contam para esta rodada.`)) return;
    const { error } = await sb.from("atualizacao_rodadas")
      .update({ encerrada_em: acao === "encerrar" ? new Date().toISOString() : null }).eq("id", r.id);
    if (error) return alert("Não foi possível alterar: " + error.message);
    return carregar();
  }
  if (acao === "excluir") {
    if (!confirm(`Excluir a rodada "${r.titulo}"?\nOs cadastros enviados pelos policiais NÃO são apagados, só o acompanhamento desta rodada.`)) return;
    const { error } = await sb.from("atualizacao_rodadas").delete().eq("id", r.id);
    if (error) return alert("Não foi possível excluir: " + error.message);
    carregar();
  }
});

/* ---------------- criar / editar ---------------- */
function abrirForm(r) {
  editando = r || null;
  $("rd-form-titulo").textContent = r ? "Editar rodada" : "Nova rodada";
  $("rd-titulo").value = r ? r.titulo : "";
  $("rd-obs").value = r ? r.observacao || "" : "";
  $("rd-inicio").value = toLocalInput(r ? r.inicio : new Date().toISOString());
  $("rd-prazo").value = r ? toLocalInput(r.prazo) : "";
  publicoForm = r ? JSON.parse(JSON.stringify(r.publico || { tipo: "todos" })) : { tipo: "todos" };
  document.querySelectorAll('input[name="rd-publico"]').forEach((x) => (x.checked = x.value === (publicoForm.tipo === "locais" ? "locais" : "todos")));
  renderPublico();
  $("rd-msg").textContent = "";
  $("rd-form").classList.add("aberto");
  $("rd-form").scrollIntoView({ behavior: "smooth", block: "start" });
  $("rd-titulo").focus();
}
function renderPublico() {
  const tipo = document.querySelector('input[name="rd-publico"]:checked').value;
  publicoForm = tipo === "locais" ? { tipo, locais: publicoForm.locais || [] } : { tipo: "todos" };
  $("rd-locais").hidden = tipo !== "locais";
  $("rd-locais").innerHTML = locaisEfetivo.map((l) =>
    `<span class="eq-chip ${publicoForm.locais?.includes(l) ? "on" : ""}" data-local="${esc(l)}" tabindex="0">${esc(l)}</span>`).join("");
  const alvo = tipo === "todos" ? efetivo : efetivo.filter((p) => publicoForm.locais.includes(p.local_trabalho));
  $("rd-total").textContent = `${alvo.length} policial(is) entram nesta rodada.`;
}
document.querySelectorAll('input[name="rd-publico"]').forEach((x) => x.addEventListener("change", renderPublico));
$("rd-locais").addEventListener("click", (ev) => {
  const c = ev.target.closest("[data-local]");
  if (!c) return;
  const i = publicoForm.locais.indexOf(c.dataset.local);
  i >= 0 ? publicoForm.locais.splice(i, 1) : publicoForm.locais.push(c.dataset.local);
  renderPublico();
});
$("btn-nova").addEventListener("click", () => abrirForm(null));
$("rd-cancelar").addEventListener("click", () => $("rd-form").classList.remove("aberto"));
$("btn-link-form").addEventListener("click", (e) => copiar(linkFormulario(), e.target));

$("rd-salvar").addEventListener("click", async () => {
  const titulo = $("rd-titulo").value.trim();
  const inicio = $("rd-inicio").value ? new Date($("rd-inicio").value).toISOString() : null;
  const prazo = $("rd-prazo").value ? new Date($("rd-prazo").value).toISOString() : null;
  const msg = (t, erro) => { $("rd-msg").textContent = t; $("rd-msg").className = "eq-msg" + (erro ? " erro" : ""); };
  if (!titulo) return msg("Dê um nome para a rodada.", true);
  if (!inicio) return msg("Informe a data de início.", true);
  if (prazo && new Date(prazo) <= new Date(inicio)) return msg("O prazo precisa ser depois do início.", true);
  if (publicoForm.tipo === "locais" && !publicoForm.locais.length) return msg("Escolha pelo menos um local de trabalho.", true);
  const registro = { titulo, inicio, prazo, publico: publicoForm, observacao: $("rd-obs").value.trim() || null };
  msg("Salvando…");
  const { error } = editando
    ? await sb.from("atualizacao_rodadas").update(registro).eq("id", editando.id)
    : await sb.from("atualizacao_rodadas").insert(registro);
  if (error) return msg("Erro ao salvar: " + error.message, true);
  $("rd-form").classList.remove("aberto");
  carregar();
});

/* ---------------- acompanhamento ---------------- */
async function abrirAcompanhamento(r) {
  ac = { rodada: r, sit: [] };
  const s = situacao(r);
  $("ac-titulo").textContent = r.titulo;
  $("ac-status").textContent = s.txt;
  $("ac-status").className = "eq-status " + s.cls;
  $("ac-sub").textContent = `Conta envios desde ${fmt(r.inicio)}` + (r.encerrada_em ? ` até ${fmt(r.encerrada_em)}` : "") +
    (r.prazo ? ` · prazo ${fmt(r.prazo)}` : "") + ".";
  $("t-pend").innerHTML = `<tr><td>Carregando…</td></tr>`;
  mostrar("v-acomp");
  const { data, error } = await sb.rpc("rodada_situacao", { p_rodada: r.id });
  if (error) { $("t-pend").innerHTML = `<tr><td>Erro: ${esc(error.message)}</td></tr>`; return; }
  ac.sit = data || [];
  const total = ac.sit.length, feitos = ac.sit.filter((x) => x.atualizou).length;
  $("k-feitos").textContent = feitos;
  $("k-pend").textContent = total - feitos;
  $("k-pct").textContent = total ? Math.round((feitos / total) * 100) + "%" : "—";
  const locais = [...new Set(ac.sit.filter((x) => !x.atualizou).map((x) => x.local_trabalho || "Sem local"))];
  $("f-local").innerHTML = `<option value="">Todos os locais</option>` + locais.map((l) => `<option>${esc(l)}</option>`).join("");
  renderPendentes(); renderPorLocal(); renderFeitos();
}
$("btn-voltar").addEventListener("click", () => { mostrar("v-lista"); carregar(); });
document.querySelectorAll("[data-sec]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-sec]").forEach((x) => x.classList.toggle("active", x === b));
  document.querySelectorAll(".eq-sec").forEach((s) => s.classList.toggle("ativa", s.id === b.dataset.sec));
}));
$("f-local").addEventListener("change", renderPendentes);

function dadosPendentes() {
  const f = $("f-local").value;
  const cab = ["Local de trabalho", "Matrícula", "Posto", "Nome", "Função", "Telefone", "Último envio (qualquer data)", "Observação"];
  const linhas = ac.sit.filter((x) => !x.atualizou && (!f || (x.local_trabalho || "Sem local") === f)).map((x) => [
    x.local_trabalho || "Sem local", x.matricula, x.posto || "", x.nome || "", x.funcao || "", x.telefone1 || "",
    x.ultimo_envio_geral ? fmtDia(x.ultimo_envio_geral) : "Nunca enviou",
    x.tem_email ? "" : "Sem e-mail no efetivo",
  ]);
  return { cab, linhas };
}
function dadosFeitos() {
  const cab = ["Local de trabalho", "Matrícula", "Posto", "Nome", "Atualizou em"];
  const linhas = ac.sit.filter((x) => x.atualizou)
    .sort((a, b) => new Date(b.enviado_em) - new Date(a.enviado_em))
    .map((x) => [x.local_trabalho || "Sem local", x.matricula, x.posto || "", x.nome || "", fmt(x.enviado_em)]);
  return { cab, linhas };
}
function dadosPorLocal() {
  const g = {};
  ac.sit.forEach((x) => {
    const l = x.local_trabalho || "Sem local";
    g[l] = g[l] || { total: 0, feitos: 0 };
    g[l].total++; if (x.atualizou) g[l].feitos++;
  });
  const cab = ["Local de trabalho", "Efetivo", "Atualizaram", "Faltam", "Adesão"];
  const linhas = Object.entries(g).sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true }))
    .map(([l, v]) => [l, v.total, v.feitos, v.total - v.feitos, Math.round((v.feitos / v.total) * 100) + "%"]);
  return { cab, linhas };
}

function renderPendentes() {
  const { linhas } = dadosPendentes();
  if (!linhas.length) { $("t-pend").innerHTML = `<tr><td>${ac.sit.length ? "Todos atualizaram." : "Nenhum policial nesta rodada."}</td></tr>`; return; }
  let ult = null;
  $("t-pend").innerHTML = `<thead><tr><th>Matrícula</th><th>Posto</th><th>Nome</th><th>Função</th><th>Telefone</th><th>Último envio</th></tr></thead><tbody>` +
    linhas.map((l) => {
      const grupo = l[0] !== ult ? `<tr class="grupo"><td colspan="6">${esc(l[0])} — ${linhas.filter((x) => x[0] === l[0]).length}</td></tr>` : "";
      ult = l[0];
      return grupo + `<tr><td>${esc(l[1])}</td><td>${esc(l[2])}</td><td>${esc(l[3])}${l[7] ? ` <span class="rd-tag alerta">· ${esc(l[7])}</span>` : ""}</td><td>${esc(l[4])}</td><td>${esc(l[5])}</td><td><span class="rd-tag">${esc(l[6])}</span></td></tr>`;
    }).join("") + "</tbody>";
}
function renderPorLocal() {
  const { cab, linhas } = dadosPorLocal();
  $("t-local").innerHTML = `<thead><tr>${cab.map((c, i) => `<th class="${i ? "num" : ""}">${c}</th>`).join("")}</tr></thead><tbody>` +
    linhas.map((l) => `<tr>${l.map((c, i) => `<td class="${i ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("") + "</tbody>";
}
function renderFeitos() {
  const { cab, linhas } = dadosFeitos();
  $("t-feitos").innerHTML = linhas.length
    ? `<thead><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>` +
      linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") + "</tbody>"
    : `<tr><td>Ninguém atualizou ainda nesta rodada.</td></tr>`;
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
  const base = (ac.rodada.titulo || "rodada").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${base}-${sufixo}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}
function baixar(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function csv({ cab, linhas }, nome) {
  const cel = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  baixar(new Blob(["\ufeff" + [cab, ...linhas].map((l) => l.map(cel).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }), nome);
}
async function xlsx(abas, nome) {
  await carregarScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
  const wb = XLSX.utils.book_new();
  abas.forEach(({ titulo, cab, linhas }) => {
    const ws = XLSX.utils.aoa_to_sheet([cab, ...linhas]);
    ws["!cols"] = cab.map((c, i) => ({ wch: Math.min(45, Math.max(10, c.length, ...linhas.map((l) => String(l[i] ?? "").length))) }));
    XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 31));
  });
  XLSX.writeFile(wb, nome);
}
async function pdf(titulo, { cab, linhas }, nome, paisagem) {
  await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4", orientation: paisagem ? "landscape" : "portrait" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(ac.rodada.titulo, 40, 46);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(`${titulo} · CIPE Sudoeste — SRHS · ${$("k-feitos").textContent} atualizaram, ${$("k-pend").textContent} faltam · gerado em ${new Date().toLocaleString("pt-BR")}`, 40, 62);
  doc.setTextColor(0);
  doc.autoTable({ startY: 74, head: [cab], body: linhas.length ? linhas : [[titulo === "Quem falta" ? "Todos atualizaram." : "Sem dados."]],
    styles: { fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: [58, 64, 48] }, margin: { left: 40, right: 40 } });
  doc.save(nome);
}
document.querySelectorAll("[data-exp]").forEach((b) => b.addEventListener("click", async () => {
  const t = b.textContent; b.disabled = true; b.textContent = "Gerando…";
  try {
    const p = dadosPendentes(), f = dadosFeitos(), l = dadosPorLocal();
    switch (b.dataset.exp) {
      case "pend-csv": csv(p, nomeArquivo("quem-falta", "csv")); break;
      case "pend-xlsx": await xlsx([{ titulo: "Quem falta", ...p }, { titulo: "Por local", ...l }, { titulo: "Já atualizaram", ...f }], nomeArquivo("quem-falta", "xlsx")); break;
      case "pend-pdf": await pdf("Quem falta" + ($("f-local").value ? " — " + $("f-local").value : ""), { cab: p.cab.slice(0, 7), linhas: p.linhas.map((x) => x.slice(0, 7)) }, nomeArquivo("quem-falta", "pdf"), true); break;
      case "local-xlsx": await xlsx([{ titulo: "Por local", ...l }], nomeArquivo("por-local", "xlsx")); break;
      case "local-pdf": await pdf("Adesão por local de trabalho", l, nomeArquivo("por-local", "pdf")); break;
      case "feitos-csv": csv(f, nomeArquivo("atualizaram", "csv")); break;
      case "feitos-xlsx": await xlsx([{ titulo: "Já atualizaram", ...f }], nomeArquivo("atualizaram", "xlsx")); break;
      case "feitos-pdf": await pdf("Já atualizaram", f, nomeArquivo("atualizaram", "pdf")); break;
    }
  } catch (e) { console.error(e); alert("Não foi possível gerar o arquivo: " + e.message); }
  b.disabled = false; b.textContent = t;
}));

/* ---------------- início ---------------- */
async function iniciar() {
  sb = window.sbAuth;
  if (!window.podeEditar) $("btn-nova").style.display = "none";
  const { data } = await sb.from("policiais").select("matricula, local_trabalho, ativo");
  efetivo = (data || []).filter((p) => p.ativo !== false);
  locaisEfetivo = [...new Set(efetivo.map((p) => p.local_trabalho).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  carregar();
}
// a página pode terminar de carregar antes ou depois da confirmação do login
window.authPronto ? iniciar() : document.addEventListener("auth-pronto", iniciar, { once: true });
