/* ============================================================
   PONTOS OPERACIONAIS — bases, apoio a viaturas, saúde, outras
   forças e comunicação. Aparecem como camadas no mapa de Área
   de Responsabilidade para quem tem permissão.
   ============================================================ */
const CATEGORIAS = {
  base: { label: "Base / Posto da CIPE", cor: "#bfae8c" },
  saude: { label: "Saúde e emergência", cor: "#e08a72" },
  combustivel: { label: "Combustível", cor: "#d0c98a" },
  mecanica: { label: "Borracharia / Oficina", cor: "#9fd08a" },
  forcas: { label: "Outras forças e órgãos", cor: "#8ab4d0" },
  comunicacao: { label: "Sinal fraco/sem sinal", cor: "#c9a2d0" },
  logistica: { label: "Logística e apoio", cor: "#8ad0c0" },
  outro: { label: "Outro", cor: "#ink-faint" },
};
// Centro padrão: Vitória da Conquista/BA, área de atuação da CIPE Sudoeste.
const CENTRO_PADRAO = [-14.8619, -40.8444];

let sb = null;
let pontos = [];
let filtroCategoria = new Set(Object.keys(CATEGORIAS));
let pontoAtual = null; // em edição (null = novo)
let miniMap = null, miniMarker = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function mostrar(v) { document.querySelectorAll(".eq-view").forEach((x) => x.classList.toggle("ativa", x.id === v)); window.scrollTo({ top: 0 }); }

/* ---------------- lista ---------------- */
async function carregar() {
  const { data, error } = await sb.from("pontos_operacionais").select("*").order("categoria").order("nome");
  if (error) { $("pt-lista").innerHTML = `<div class="eq-vazio">Erro ao carregar: ${esc(error.message)}</div>`; return; }
  pontos = data || [];
  renderFiltros();
  renderLista();
}
function renderFiltros() {
  $("pt-filtros").innerHTML = Object.entries(CATEGORIAS).map(([k, c]) =>
    `<span class="pt-cat-chip ${filtroCategoria.has(k) ? "on" : ""}" data-cat="${k}"><i style="background:${c.cor}"></i>${c.label} (${pontos.filter((p) => p.categoria === k).length})</span>`
  ).join("");
  $("pt-filtros").querySelectorAll("[data-cat]").forEach((el) => el.addEventListener("click", () => {
    filtroCategoria.has(el.dataset.cat) ? filtroCategoria.delete(el.dataset.cat) : filtroCategoria.add(el.dataset.cat);
    renderFiltros(); renderLista();
  }));
}
function renderLista() {
  const lista = pontos.filter((p) => filtroCategoria.has(p.categoria));
  if (!lista.length) {
    $("pt-lista").innerHTML = `<div class="eq-vazio">Nenhum ponto${pontos.length ? " nesta categoria" : " cadastrado ainda"}.${window.podeEditar && !pontos.length ? "<br>Clique em <b>Novo ponto</b> para começar." : ""}</div>`;
    return;
  }
  $("pt-lista").innerHTML = lista.map((p) => `<div class="pt-item">
    <span class="dot" style="background:${CATEGORIAS[p.categoria]?.cor || "#888"}"></span>
    <div>
      <h4>${esc(p.nome)}${!p.ativo ? " (inativo)" : ""}</h4>
      <div class="meta">
        <span>${CATEGORIAS[p.categoria]?.label || p.categoria}</span>
        ${p.telefone ? `<span>${esc(p.telefone)}</span>` : ""}
        ${p.horario ? `<span>${esc(p.horario)}</span>` : ""}
      </div>
    </div>
    <div class="acoes">
      ${window.podeEditar ? `<button type="button" class="ef-btn" data-acao="editar-ponto" data-id="${p.id}">Editar</button>` : ""}
    </div>
  </div>`).join("");
  $("pt-lista").querySelectorAll("[data-acao=editar-ponto]").forEach((b) => b.addEventListener("click", () => abrirForm(pontos.find((p) => p.id === b.dataset.id))));
}
$("btn-novo-ponto").addEventListener("click", () => abrirForm(null));
$("btn-voltar").addEventListener("click", () => { mostrar("v-lista"); carregar(); });

/* ---------------- formulário ---------------- */
function abrirForm(p) {
  pontoAtual = p;
  $("pt-form-titulo").textContent = p ? "Editar ponto" : "Novo ponto";
  $("pt-categoria").innerHTML = Object.entries(CATEGORIAS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join("");
  $("pt-categoria").value = p?.categoria || "base";
  $("pt-nome").value = p?.nome || "";
  $("pt-telefone").value = p?.telefone || "";
  $("pt-horario").value = p?.horario || "";
  $("pt-endereco").value = p?.endereco || "";
  $("pt-observacao").value = p?.observacao || "";
  $("pt-lat").value = p?.latitude ?? "";
  $("pt-lng").value = p?.longitude ?? "";
  $("btn-excluir-ponto").style.display = p && window.podeEditar ? "" : "none";
  $("pt-msg").textContent = "";
  mostrar("v-form");
  setTimeout(() => iniciarMiniMapa(p ? [p.latitude, p.longitude] : null), 50);
}
function iniciarMiniMapa(posInicial) {
  if (miniMap) { miniMap.remove(); miniMap = null; }
  const centro = posInicial || CENTRO_PADRAO;
  miniMap = L.map("pt-minimap").setView(centro, posInicial ? 14 : 9);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(miniMap);
  miniMarker = posInicial ? L.marker(posInicial, { draggable: true }).addTo(miniMap) : null;
  if (miniMarker) miniMarker.on("dragend", () => atualizarCoordsDoMarcador());
  miniMap.on("click", (e) => {
    if (miniMarker) miniMap.removeLayer(miniMarker);
    miniMarker = L.marker(e.latlng, { draggable: true }).addTo(miniMap);
    miniMarker.on("dragend", () => atualizarCoordsDoMarcador());
    atualizarCoordsDoMarcador();
  });
  setTimeout(() => miniMap.invalidateSize(), 100);
}
function atualizarCoordsDoMarcador() {
  const ll = miniMarker.getLatLng();
  $("pt-lat").value = ll.lat.toFixed(6);
  $("pt-lng").value = ll.lng.toFixed(6);
  $("pt-coords-status").textContent = "";
}
["pt-lat", "pt-lng"].forEach((id) => $(id).addEventListener("change", () => {
  const lat = parseFloat($("pt-lat").value), lng = parseFloat($("pt-lng").value);
  if (isNaN(lat) || isNaN(lng) || !miniMap) return;
  const ll = [lat, lng];
  if (miniMarker) miniMap.removeLayer(miniMarker);
  miniMarker = L.marker(ll, { draggable: true }).addTo(miniMap);
  miniMarker.on("dragend", () => atualizarCoordsDoMarcador());
  miniMap.setView(ll, 14);
}));

async function salvarPonto() {
  const lat = parseFloat($("pt-lat").value), lng = parseFloat($("pt-lng").value);
  const nome = $("pt-nome").value.trim();
  if (!nome) { $("pt-msg").textContent = "Dê um nome ao ponto."; $("pt-msg").className = "eq-msg erro"; return; }
  if (isNaN(lat) || isNaN(lng)) { $("pt-msg").textContent = "Marque a localização no mapa ou digite as coordenadas."; $("pt-msg").className = "eq-msg erro"; return; }
  const registro = {
    categoria: $("pt-categoria").value, nome,
    telefone: $("pt-telefone").value.trim() || null,
    horario: $("pt-horario").value.trim() || null,
    endereco: $("pt-endereco").value.trim() || null,
    observacao: $("pt-observacao").value.trim() || null,
    latitude: lat, longitude: lng,
    atualizado_em: new Date().toISOString(),
  };
  $("pt-msg").textContent = "Salvando…"; $("pt-msg").className = "eq-msg";
  const { error } = pontoAtual
    ? await sb.from("pontos_operacionais").update(registro).eq("id", pontoAtual.id)
    : await sb.from("pontos_operacionais").insert(registro);
  if (error) { $("pt-msg").textContent = "Erro: " + error.message; $("pt-msg").className = "eq-msg erro"; return; }
  mostrar("v-lista"); carregar();
}
$("btn-salvar-ponto").addEventListener("click", salvarPonto);
$("btn-excluir-ponto").addEventListener("click", async () => {
  if (!pontoAtual) return;
  if (!confirm(`Excluir "${pontoAtual.nome}"?`)) return;
  const { error } = await sb.from("pontos_operacionais").delete().eq("id", pontoAtual.id);
  if (error) return alert("Erro: " + error.message);
  mostrar("v-lista"); carregar();
});

/* ---------------- início ---------------- */
async function iniciar() { sb = window.sbAuth; if (!window.podeEditar) $("btn-novo-ponto").style.display = "none"; await carregar(); }
window.authPronto ? iniciar() : document.addEventListener("auth-pronto", iniciar, { once: true });
