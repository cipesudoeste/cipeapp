/* ============================================================
   ATUALIZAÇÃO CADASTRAL — formulário público (standalone)
   Sem navegação para o resto do sistema — só o assistente.
   ============================================================ */

const TOTAL_STEPS = 8; // 0..7
let currentStep = 0;
let uploadedCnh = null; // {url, path, nome, tamanho}
let uploadedBgo = null;
let uploadedIdentidade = null;

/* ---------------------------------------------------------
   Supabase
--------------------------------------------------------- */
let sb = null;
try {
  if (window.supabase && SUPABASE_URL && !SUPABASE_URL.includes("SEU-PROJETO")) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabase não inicializado:", e);
}

function escapeHtml(s) {
  return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtDateBR(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 7 ? iso + "-01T00:00:00" : iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return iso.length === 7
    ? d.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })
    : d.toLocaleDateString("pt-BR");
}
function formatBytes(n) {
  if (!n) return "0 KB";
  const kb = n / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/* ---------------------------------------------------------
   Busca por matrícula (consulta a base do Efetivo)
--------------------------------------------------------- */
function setVal(id, v) {
  const el = document.getElementById(id);
  if (el && v !== undefined && v !== null && v !== "") el.value = v;
}
function marcarChecklist(containerId, valores) {
  const set = new Set(valores || []);
  document.querySelectorAll(`#${containerId} input[type="checkbox"]`).forEach((cb) => {
    cb.checked = set.has(cb.value);
  });
}
function atualizarStatusArquivo(elId, arquivo) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!arquivo) { el.textContent = ""; return; }
  const tamanho = arquivo.tamanho ? ` (${formatBytes(arquivo.tamanho)})` : "";
  el.innerHTML = arquivo.url
    ? `Já enviado: <a href="${arquivo.url}" target="_blank" rel="noopener">👁 ver ${escapeHtml(arquivo.nome)}</a>${tamanho} — confira se ainda está válido; escolha um arquivo abaixo para substituir.`
    : `Já enviado anteriormente: ${escapeHtml(arquivo.nome)}`;
}

/* Preenche TODO o formulário com um cadastro já existente (atualização) */
function preencherFormularioCompleto(cadastro) {
  const d = cadastro.dados || {};
  document.getElementById("c-nome").value = cadastro.nome || "";
  document.getElementById("c-matricula").value = cadastro.matricula || "";

  setVal("c-titulo-numero", d.tituloEleitorNumero);
  setVal("c-titulo-zona", d.tituloEleitorZona);
  setVal("c-titulo-secao", d.tituloEleitorSecao);
  setVal("c-cpf", d.cpf);
  setVal("c-rg", d.rg);
  setVal("c-orgao-expedidor", d.orgaoExpedidor);
  setVal("c-mae", d.filiacaoMae);
  setVal("c-pai", d.filiacaoPai);
  setVal("c-nascimento", d.dataNascimento);
  setVal("c-estado-civil", d.estadoCivil);

  setVal("c-tel1", d.telefone1);
  setVal("c-tel1-whats", d.telefone1Whatsapp);
  setVal("c-tel2", d.telefone2);
  setVal("c-tel2-whats", d.telefone2Whatsapp);
  setVal("c-email", d.email);
  setVal("c-end-logradouro", d.enderecoLogradouro);
  setVal("c-end-complemento", d.enderecoComplemento);
  setVal("c-end-cidade", d.enderecoCidade);
  setVal("c-end-estado", d.enderecoEstado);
  setVal("c-end-cep", d.enderecoCep);
  setVal("c-end-pais", d.enderecoPais || "Brasil");

  setVal("c-emerg1-nome", d.emergenciaPessoa1Nome);
  setVal("c-emerg1-parentesco", d.emergenciaPessoa1Parentesco);
  setVal("c-emerg1-tel", d.emergenciaPessoa1Telefone);
  setVal("c-emerg1-whats", d.emergenciaPessoa1Whatsapp);
  setVal("c-emerg2-nome", d.emergenciaPessoa2Nome);
  setVal("c-emerg2-parentesco", d.emergenciaPessoa2Parentesco);
  setVal("c-emerg2-tel", d.emergenciaPessoa2Telefone);
  setVal("c-emerg2-whats", d.emergenciaPessoa2Whatsapp);
  setVal("c-plano-saude", d.possuiPlanoSaude);
  setVal("c-tipo-sanguineo", d.tipoSanguineo);
  setVal("c-plano-saude-qual", d.planoSaudeQual);
  setVal("c-plano-saude-outro", d.planoSaudeOutro);
  setVal("c-carteirinha", d.carteirinhaNumero);

  setVal("c-possui-cnh", d.possuiCnh);
  setVal("c-cnh-vencida", d.cnhVencida);
  setVal("c-cnh-numero", d.cnhNumero);
  setVal("c-cnh-categoria", d.cnhCategoria);
  setVal("c-cnh-validade", d.cnhValidade);
  setVal("c-cnh-primeira-hab", d.cnhPrimeiraHabilitacao);
  setVal("c-possui-ccve", d.possuiCcve);
  setVal("c-ccve-conclusao", d.ccveConclusao);
  uploadedCnh = d.cnhArquivo || null;
  atualizarStatusArquivo("cnh-upload-status", uploadedCnh);

  setVal("c-gh", d.gh);
  setVal("c-local-trabalho", d.localTrabalho);
  setVal("c-funcao", d.funcao);
  setVal("c-nome-guerra", d.nomeGuerra);
  setVal("c-possui-identidade", d.possuiIdentidadeFuncional);
  setVal("c-identidade-motivo", d.identidadeMotivo);
  setVal("c-identidade-atualizada", d.identidadeAtualizada);
  setVal("c-identidade-ilegivel", d.identidadeIlegivel);
  uploadedIdentidade = d.identidadeArquivo || null;
  atualizarStatusArquivo("identidade-upload-status", uploadedIdentidade);
  setVal("c-data-admissao", d.dataAdmissao);
  setVal("c-data-ultima-promocao", d.dataUltimaPromocao);
  setVal("c-possui-bgo", d.possuiBgo);
  setVal("c-bgo-numero", d.bgoNumero);
  setVal("c-bgo-data", d.bgoData);
  uploadedBgo = d.bgoArquivo || null;
  atualizarStatusArquivo("bgo-upload-status", uploadedBgo);

  setVal("c-aptidao-aquatica", d.aptidaoAquatica);
  setVal("c-possui-cursos-pmba", d.possuiCursosPmba);
  setVal("c-formacao", d.formacaoEducacional);
  setVal("c-formacao-completa", d.formacaoCompleta);
  setVal("c-formacao-qual-curso", d.formacaoQualCurso);
  marcarChecklist("c-cursos-pm-list", d.cursosPm);
  setVal("c-cursos-pm-outros", d.cursosPmOutros);

  // Pendências ficam propositalmente em branco: é sempre uma nova
  // solicitação, reaproveitar pendências antigas poderia reabrir
  // algo que já foi resolvido.

  updateConditionals();
}

/* ---------------------------------------------------------
   Estado da verificação por e-mail
--------------------------------------------------------- */
let matriculaConfirmada = null;
let nomeConfirmado = null;
let cadastroAtual = null;    // último envio próprio (cadastros_ingresso), se existir
let modoCodigo = "entrar";   // entrar | recuperar
const METODO_LOGIN = "cipe-formulario-metodo";

const ERROS_ID = {
  matricula_invalida: "A matrícula tem exatamente 8 números.",
  matricula_nao_encontrada: "matricula_nao_encontrada",
  sem_email: "sem_email",
  aguarde: "Um código acabou de ser enviado. Aguarde um minuto antes de pedir outro.",
  falha_envio: "Não foi possível enviar o código agora. Tente novamente em instantes.",
  codigo_invalido: "Código incorreto ou expirado. Confira o e-mail ou peça um novo código.",
  senha_invalida: "Matrícula ou senha incorretos. Se ainda não criou senha, use \"Com código por e-mail\".",
  bloqueado: "Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.",
  falha_interna: "Erro no servidor. Tente novamente em instantes.",
};

function mostrarSubTela(id) {
  document.querySelectorAll(".auth-view").forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}
function idMsg(texto, erro) {
  document.getElementById("id-msg").textContent = texto || "";
  document.getElementById("id-msg").className = "eq-msg" + (erro ? " erro" : "");
}
function idMsgCodigo(texto, erro) {
  document.getElementById("id-msg-codigo").textContent = texto || "";
  document.getElementById("id-msg-codigo").className = "wf-search-result" + (erro ? " notfound" : "");
}
function matriculaDigitada() {
  return document.getElementById("id-mat").value.replace(/\D/g, "");
}

async function chamarIdentificacao(corpo) {
  if (!sb) return { erro: "falha_interna" };
  const { data, error } = await sb.functions.invoke("verificar-matricula", { body: corpo });
  if (!error) return data;
  let info = {};
  try { info = await error.context.json(); } catch (_) {}
  return { erro: info.erro || "falha_interna" };
}

function mostrarSemAcesso(codigoErro) {
  const titulo = document.getElementById("id-sem-acesso-titulo");
  const texto = document.getElementById("id-sem-acesso-texto");
  if (codigoErro === "sem_email") {
    titulo.textContent = "Sua matrícula não tem e-mail cadastrado";
    texto.textContent = "Procure a SRHS para cadastrarmos um e-mail antes de liberar a atualização.";
  } else {
    titulo.textContent = "Não encontramos essa matrícula";
    texto.textContent = "Confira o número digitado ou procure a SRHS para regularizar seu cadastro no efetivo antes de continuar.";
  }
  mostrarSubTela("id-tela-sem-acesso");
}

/* ---- abas "Com senha" / "Com código por e-mail" ---- */
document.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-aba]").forEach((x) => x.setAttribute("aria-selected", x === b));
  document.querySelectorAll("#id-tela [data-painel]").forEach((p) => (p.hidden = p.dataset.painel !== b.dataset.aba));
  idMsg("");
}));
document.getElementById("id-mat").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 8); });
document.getElementById("id-ver-senha").addEventListener("click", () => {
  const i = document.getElementById("id-senha");
  i.type = i.type === "password" ? "text" : "password";
  document.getElementById("id-ver-senha").textContent = i.type === "password" ? "Mostrar" : "Ocultar";
});

/* ---- entrar com senha ---- */
document.getElementById("id-btn-entrar").addEventListener("click", async () => {
  const matricula = matriculaDigitada();
  if (matricula.length !== 8) return idMsg(ERROS_ID.matricula_invalida, true);
  const senha = document.getElementById("id-senha").value;
  if (!senha) return idMsg("Digite sua senha, ou use \"Com código por e-mail\".", true);
  const btn = document.getElementById("id-btn-entrar");
  btn.disabled = true; idMsg("Entrando…");
  const r = await chamarIdentificacao({ acao: "entrar", matricula, senha });
  btn.disabled = false;
  if (r.erro) {
    if (r.erro === "matricula_nao_encontrada" || r.erro === "sem_email") return mostrarSemAcesso(r.erro);
    return idMsg(ERROS_ID[r.erro] || ERROS_ID.falha_interna, true);
  }
  await sb.auth.setSession(r.session);
  sessionStorage.setItem(METODO_LOGIN, "senha");
  await confirmarIdentidade(r.matricula, r.nome);
});
document.getElementById("id-senha").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("id-btn-entrar").click(); });
document.getElementById("id-mat").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("id-senha").focus(); });

/* ---- pedir código (entrar sem senha, ou recuperar/criar senha) ---- */
async function pedirCodigo(modo, botao) {
  const matricula = matriculaDigitada();
  if (matricula.length !== 8) return idMsg(ERROS_ID.matricula_invalida, true);
  modoCodigo = modo;
  botao.disabled = true; idMsg("Enviando código…");
  const r = await chamarIdentificacao({ acao: "solicitar", matricula });
  botao.disabled = false;
  if (r.erro) {
    if (r.erro === "matricula_nao_encontrada" || r.erro === "sem_email") return mostrarSemAcesso(r.erro);
    return idMsg(ERROS_ID[r.erro] || ERROS_ID.falha_interna, true);
  }
  document.getElementById("id-codigo-texto").innerHTML =
    (modo === "recuperar" ? "Para criar sua senha, confirme que é você. " : "") +
    "Enviamos um código para <b>" + escapeHtml(r.email_mascarado) + "</b>. Confira também a caixa de spam.";
  document.getElementById("id-codigo").value = "";
  idMsgCodigo("");
  mostrarSubTela("id-tela-codigo");
  document.getElementById("id-codigo").focus();
}
document.getElementById("id-btn-codigo").addEventListener("click", (e) => pedirCodigo("entrar", e.target));
document.getElementById("id-btn-esqueci").addEventListener("click", (e) => pedirCodigo("recuperar", e.target));
document.getElementById("id-btn-reenviar").addEventListener("click", (e) => pedirCodigo(modoCodigo, e.target));

document.getElementById("id-btn-confirmar").addEventListener("click", confirmarCodigo);
document.getElementById("id-codigo").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmarCodigo(); });
async function confirmarCodigo() {
  const matricula = matriculaDigitada();
  const codigo = document.getElementById("id-codigo").value.replace(/\s/g, "");
  if (!codigo) return idMsgCodigo("Digite o código recebido.", true);
  const btn = document.getElementById("id-btn-confirmar");
  btn.disabled = true; idMsgCodigo("Confirmando…");
  const r = await chamarIdentificacao({ acao: "verificar", matricula, codigo });
  btn.disabled = false;
  if (r.erro) return idMsgCodigo(ERROS_ID[r.erro] || ERROS_ID.falha_interna, true);
  await sb.auth.setSession(r.session);
  sessionStorage.setItem(METODO_LOGIN, "codigo");

  const { data: temSenha } = await sb.rpc("tenho_senha");
  if (modoCodigo === "recuperar" || !temSenha) {
    mostrarSubTela("id-tela-senha-nova");
    SenhaUI.montar(document.getElementById("id-senha-nova-box"), sb, {
      titulo: temSenha ? "Nova senha" : "Criar senha",
      texto: temSenha
        ? "Defina a nova senha. Ela vale para a próxima vez que você atualizar seu cadastro."
        : "Crie uma senha para entrar mais rápido da próxima vez. Você continua podendo usar o código por e-mail.",
      botao: "Salvar e continuar",
      pularTexto: modoCodigo === "recuperar" ? null : "Agora não",
      aoConcluir: () => { sessionStorage.setItem(METODO_LOGIN, "senha"); confirmarIdentidade(r.matricula, r.nome); },
      aoPular: () => confirmarIdentidade(r.matricula, r.nome),
    });
    return;
  }
  await confirmarIdentidade(r.matricula, r.nome);
}

/* ---- identidade confirmada: busca o envio mais recente e libera o formulário ---- */
async function confirmarIdentidade(matricula, nome) {
  matriculaConfirmada = matricula;
  nomeConfirmado = nome;
  const { data, error } = await sb
    .from("cadastros_ingresso")
    .select("*")
    .eq("matricula", matricula)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  cadastroAtual = error ? null : data || null;
  if (cadastroAtual) {
    preencherFormularioCompleto(cadastroAtual);
  } else {
    document.getElementById("c-nome").value = nome || "";
    document.getElementById("c-matricula").value = matricula;
  }
  const emailAtual = (cadastroAtual && cadastroAtual.dados && cadastroAtual.dados.email) || "";
  if (!emailAtual) setVal("c-email", "");
  const campoMatricula = document.getElementById("c-matricula");
  campoMatricula.value = matricula;
  campoMatricula.readOnly = true;
  irParaEtapa(1);
}

document.getElementById("id-btn-voltar").addEventListener("click", () => { idMsgCodigo(""); mostrarSubTela("id-tela"); });
document.getElementById("id-btn-sem-acesso-voltar").addEventListener("click", () => { idMsg(""); mostrarSubTela("id-tela"); });


/* ---------------------------------------------------------
   Campos condicionais (data-show-if="id=valor")
--------------------------------------------------------- */
function updateConditionals() {
  document.querySelectorAll(".wf-cond").forEach((el) => {
    const cond = el.dataset.showIf;
    if (!cond) return;
    const [fieldId, expected] = cond.split("=");
    const field = document.getElementById(fieldId);
    const visible = field && field.value === expected;
    el.classList.toggle("wf-visible", !!visible);
    // campos escondidos não devem bloquear validação
    const input = el.querySelector("input, select, textarea");
    if (input) input.dataset.condHidden = visible ? "" : "1";
  });
}
document.getElementById("wiz-form").addEventListener("change", (e) => {
  if (e.target.matches("select, input")) updateConditionals();
});

/* ---------------------------------------------------------
   Barra de progresso
--------------------------------------------------------- */
const NOMES_ETAPAS = [
  "Verificação", "Identificação", "Contatos e Endereço", "Informações Emergenciais",
  "CNH", "Informações Funcionais", "Competências", "Pendências",
];

function renderProgress() {
  const el = document.getElementById("wiz-progress");
  el.innerHTML = "";
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const seg = document.createElement("div");
    seg.className = "seg" + (i < currentStep ? " done" : i === currentStep ? " current" : "");
    el.appendChild(seg);
  }
  const labelEl = document.getElementById("wiz-step-label");
  if (labelEl) {
    labelEl.innerHTML = currentStep === 0
      ? ""
      : `<span>Etapa ${currentStep} de ${TOTAL_STEPS - 1}</span><b>${NOMES_ETAPAS[currentStep]}</b>`;
  }
}

/* ---------------------------------------------------------
   Validação da etapa atual
--------------------------------------------------------- */
function validarEtapaAtual() {
  const stepEl = document.querySelector(`.wiz-step[data-step="${currentStep}"]`);
  if (!stepEl) return true;
  const campos = stepEl.querySelectorAll("[required]");
  for (const campo of campos) {
    if (campo.dataset.condHidden === "1") continue; // escondido, ignora
    if (!campo.value || !campo.value.trim()) {
      campo.focus();
      campo.style.borderColor = "#b0553f";
      setTimeout(() => (campo.style.borderColor = ""), 1500);
      return false;
    }
  }
  // validações específicas por etapa
  if (currentStep === 5 && val("c-possui-identidade") === "Sim" && !uploadedIdentidade) {
    alert("Anexe a cópia da sua Identidade Funcional (frente e verso) antes de continuar.");
    document.getElementById("c-identidade-arquivo").focus();
    return false;
  }
  if (currentStep === 6) {
    const marcados = document.querySelectorAll("#c-cursos-pm-list input:checked");
    if (marcados.length === 0) {
      alert("Marque ao menos um curso (ou preencha o campo de texto abaixo se não possuir nenhum da lista).");
      return false;
    }
  }
  if (currentStep === 7) {
    const marcados = document.querySelectorAll("#c-pendencias-list input:checked");
    if (marcados.length === 0) {
      alert("Marque ao menos uma situação que deseja tratar.");
      return false;
    }
  }
  return true;
}

/* ---------------------------------------------------------
   Navegação entre etapas
--------------------------------------------------------- */
function irParaEtapa(n) {
  document.querySelectorAll(".wiz-step").forEach((el) => el.classList.remove("active"));
  document.querySelector(`.wiz-step[data-step="${n}"]`).classList.add("active");
  currentStep = n;
  renderProgress();
  document.getElementById("wiz-nav").style.display = n === 0 ? "none" : "flex";
  document.getElementById("wiz-btn-voltar").disabled = currentStep === 0;
  document.getElementById("wiz-btn-proximo").style.display = currentStep === TOTAL_STEPS - 1 ? "none" : "flex";
  document.getElementById("wiz-btn-enviar").style.display = currentStep === TOTAL_STEPS - 1 ? "flex" : "none";
  // Qualquer caminho de volta à etapa 0 (inclusive o botão "Voltar" do
  // assistente) reinicia o fluxo de verificação do zero — nunca deixa
  // um cadastro "encontrado" de uma busca anterior preso na memória.
  if (n === 0) voltarParaBusca();
  window.scrollTo({ top: document.querySelector(".wiz-progress").offsetTop - 90, behavior: "smooth" });
}

document.getElementById("wiz-btn-proximo").addEventListener("click", () => {
  if (!validarEtapaAtual()) return;
  if (currentStep < TOTAL_STEPS - 1) irParaEtapa(currentStep + 1);
});
document.getElementById("wiz-btn-voltar").addEventListener("click", () => {
  if (currentStep > 0) irParaEtapa(currentStep - 1);
});

/* ---------------------------------------------------------
   Upload de arquivos (CNH / BGO) — mesmo bucket, pastas separadas
--------------------------------------------------------- */
async function uploadArquivoCadastro(file, pasta, statusElId) {
  const statusEl = document.getElementById(statusElId);
  if (!sb) {
    if (statusEl) statusEl.textContent = "Envio indisponível (Supabase não configurado).";
    return null;
  }
  const tiposAceitos = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!tiposAceitos.includes(file.type)) {
    alert("Só é permitido enviar PDF, JPG, PNG ou WEBP.");
    return null;
  }
  if (statusEl) statusEl.textContent = "Enviando...";
  const safeName = file.name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${pasta}/${Date.now()}_${safeName}`;
  const { error } = await sb.storage.from("cadastros-anexos").upload(path, file);
  if (error) {
    console.error(error);
    if (statusEl) statusEl.textContent = "Erro ao enviar: " + (error.message || "erro desconhecido");
    return null;
  }
  const { data } = sb.storage.from("cadastros-anexos").getPublicUrl(path);
  if (statusEl) statusEl.innerHTML = `Enviado: <a href="${data.publicUrl}" target="_blank" rel="noopener">👁 ver ${escapeHtml(file.name)}</a>`;
  return { url: data.publicUrl, path, nome: file.name, tamanho: file.size };
}

document.getElementById("c-cnh-arquivo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) uploadedCnh = await uploadArquivoCadastro(file, "cnh", "cnh-upload-status");
});
document.getElementById("c-bgo-arquivo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) uploadedBgo = await uploadArquivoCadastro(file, "bgo", "bgo-upload-status");
});
document.getElementById("c-identidade-arquivo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) uploadedIdentidade = await uploadArquivoCadastro(file, "identidade", "identidade-upload-status");
});

/* ---------------------------------------------------------
   Coleta de todos os dados do formulário
--------------------------------------------------------- */
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}
function checklistValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map((c) => c.value);
}

function coletarDados() {
  return {
    // Identificação
    tituloEleitorNumero: val("c-titulo-numero"),
    tituloEleitorZona: val("c-titulo-zona"),
    tituloEleitorSecao: val("c-titulo-secao"),
    cpf: val("c-cpf"),
    rg: val("c-rg"),
    orgaoExpedidor: val("c-orgao-expedidor"),
    filiacaoMae: val("c-mae"),
    filiacaoPai: val("c-pai"),
    dataNascimento: val("c-nascimento"),
    estadoCivil: val("c-estado-civil"),
    // Contatos e endereço
    telefone1: val("c-tel1"),
    telefone1Whatsapp: val("c-tel1-whats"),
    telefone2: val("c-tel2"),
    telefone2Whatsapp: val("c-tel2-whats"),
    email: val("c-email"),
    enderecoLogradouro: val("c-end-logradouro"),
    enderecoComplemento: val("c-end-complemento"),
    enderecoCidade: val("c-end-cidade"),
    enderecoEstado: val("c-end-estado"),
    enderecoCep: val("c-end-cep"),
    enderecoPais: val("c-end-pais"),
    // Emergência
    emergenciaPessoa1Nome: val("c-emerg1-nome"),
    emergenciaPessoa1Parentesco: val("c-emerg1-parentesco"),
    emergenciaPessoa1Telefone: val("c-emerg1-tel"),
    emergenciaPessoa1Whatsapp: val("c-emerg1-whats"),
    emergenciaPessoa2Nome: val("c-emerg2-nome"),
    emergenciaPessoa2Parentesco: val("c-emerg2-parentesco"),
    emergenciaPessoa2Telefone: val("c-emerg2-tel"),
    emergenciaPessoa2Whatsapp: val("c-emerg2-whats"),
    possuiPlanoSaude: val("c-plano-saude"),
    tipoSanguineo: val("c-tipo-sanguineo"),
    planoSaudeQual: val("c-plano-saude-qual"),
    planoSaudeOutro: val("c-plano-saude-outro"),
    carteirinhaNumero: val("c-carteirinha"),
    // CNH
    possuiCnh: val("c-possui-cnh"),
    cnhVencida: val("c-cnh-vencida"),
    cnhNumero: val("c-cnh-numero"),
    cnhCategoria: val("c-cnh-categoria"),
    cnhValidade: val("c-cnh-validade"),
    cnhPrimeiraHabilitacao: val("c-cnh-primeira-hab"),
    possuiCcve: val("c-possui-ccve"),
    ccveConclusao: val("c-ccve-conclusao"),
    cnhArquivo: uploadedCnh,
    // Informações funcionais
    gh: val("c-gh"),
    localTrabalho: val("c-local-trabalho"),
    funcao: val("c-funcao"),
    nomeGuerra: val("c-nome-guerra"),
    possuiIdentidadeFuncional: val("c-possui-identidade"),
    identidadeMotivo: val("c-identidade-motivo"),
    identidadeAtualizada: val("c-identidade-atualizada"),
    identidadeIlegivel: val("c-identidade-ilegivel"),
    identidadeArquivo: val("c-possui-identidade") === "Sim" ? uploadedIdentidade : null,
    dataAdmissao: val("c-data-admissao"),
    dataUltimaPromocao: val("c-data-ultima-promocao"),
    possuiBgo: val("c-possui-bgo"),
    bgoNumero: val("c-bgo-numero"),
    bgoData: val("c-bgo-data"),
    bgoArquivo: uploadedBgo,
    // Competências
    aptidaoAquatica: val("c-aptidao-aquatica"),
    possuiCursosPmba: val("c-possui-cursos-pmba"),
    formacaoEducacional: val("c-formacao"),
    formacaoCompleta: val("c-formacao-completa"),
    formacaoQualCurso: val("c-formacao-qual-curso"),
    cursosPm: checklistValues("c-cursos-pm-list"),
    cursosPmOutros: val("c-cursos-pm-outros"),
    // Pendências
    pendencias: checklistValues("c-pendencias-list"),
    pendenciaDescricao: val("c-pendencia-descricao"),
  };
}

/* ---------------------------------------------------------
   Envio final
--------------------------------------------------------- */
document.getElementById("wiz-btn-enviar").addEventListener("click", async () => {
  if (!validarEtapaAtual()) return;
  const nome = val("c-nome");
  const matricula = matriculaConfirmada || val("c-matricula").replace(/\D/g, "");
  if (matricula.length !== 8) {
    alert("A matrícula precisa ter exatamente 8 números (confira a etapa Informações Funcionais).");
    return;
  }
  if (matriculaConfirmada && matricula !== matriculaConfirmada) {
    alert("A matrícula não pode ser alterada aqui — ela é confirmada na identificação.");
    return;
  }
  if (!nome || !matricula) {
    alert("Nome e matrícula são obrigatórios (confira as etapas anteriores).");
    return;
  }
  const btn = document.getElementById("wiz-btn-enviar");
  btn.disabled = true;
  btn.textContent = "Enviando...";
  const dados = coletarDados();
  try {
    if (!sb) throw new Error("Supabase não configurado.");
    const { error } = await sb.from("cadastros_ingresso").insert({ matricula, nome, dados });
    if (error) throw error;
    document.getElementById("wiz-form").style.display = "none";
    document.getElementById("sucesso-nome").textContent = nome.split(" ")[0] || nome;
    document.getElementById("sucesso-matricula").textContent = matricula;
    document.getElementById("sucesso-data").textContent = new Date().toLocaleString("pt-BR");
    document.getElementById("wiz-sucesso").style.display = "block";
  } catch (e) {
    console.error(e);
    alert("Erro ao enviar o cadastro: " + (e.message || "erro desconhecido") + "\n\nVerifique se a tabela 'cadastros_ingresso' foi criada no Supabase (cadastro_setup.sql).");
    btn.disabled = false;
    btn.textContent = "Enviar Cadastro";
  }
});

async function resetarFormulario() {
  document.getElementById("wiz-form").reset();
  document.getElementById("wiz-form").style.display = "block";
  document.getElementById("wiz-sucesso").style.display = "none";
  document.getElementById("id-msg").textContent = "";
  document.getElementById("id-msg-codigo").textContent = "";
  document.getElementById("id-mat").value = "";
  document.getElementById("id-senha").value = "";
  document.getElementById("cnh-upload-status").textContent = "";
  document.getElementById("bgo-upload-status").textContent = "";
  document.getElementById("identidade-upload-status").textContent = "";
  uploadedCnh = null;
  uploadedBgo = null;
  uploadedIdentidade = null;
  cadastroAtual = null;
  matriculaConfirmada = null;
  nomeConfirmado = null;
  document.getElementById("c-matricula").readOnly = false;
  if (sb) { try { await sb.auth.signOut(); } catch (e) {} }
  sessionStorage.removeItem(METODO_LOGIN);
  mostrarSubTela("id-tela");
  const btnEnviar = document.getElementById("wiz-btn-enviar");
  btnEnviar.disabled = false;
  btnEnviar.textContent = "Enviar Cadastro";
  updateConditionals();
  irParaEtapa(0);
}
document.getElementById("wiz-btn-novo").addEventListener("click", resetarFormulario);

/* ---------------------------------------------------------
   Máscaras de entrada (CPF, telefone, CEP)
--------------------------------------------------------- */
function maskCpf(v) {
  return v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskTelefone(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}
function maskCep(v) {
  return v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

function aplicarMascara(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    const pos = el.selectionStart;
    const antes = el.value.length;
    el.value = fn(el.value);
    const depois = el.value.length;
    // mantém o cursor num lugar razoável após a máscara reformatar o texto
    try { el.setSelectionRange(pos + (depois - antes), pos + (depois - antes)); } catch (e) {}
  });
}

["c-cpf"].forEach((id) => aplicarMascara(id, maskCpf));
["c-tel1", "c-tel2", "c-emerg1-tel", "c-emerg2-tel"].forEach((id) => aplicarMascara(id, maskTelefone));
["c-end-cep"].forEach((id) => aplicarMascara(id, maskCep));

/* ---------------------------------------------------------
   Caixa alta automática em campos de dados pessoais
--------------------------------------------------------- */
const CAMPOS_MAIUSCULA = [
  "c-nome", "c-mae", "c-pai", "c-nome-guerra",
  "c-emerg1-nome", "c-emerg2-nome",
  "c-end-logradouro", "c-end-complemento", "c-end-cidade",
  "c-orgao-expedidor",
];
CAMPOS_MAIUSCULA.forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    const pos = el.selectionStart;
    el.value = el.value.toUpperCase();
    try { el.setSelectionRange(pos, pos); } catch (e) {}
  });
});
// Estado (sigla) também em maiúscula, mas sem precisar de cursor especial (campo curto)
const campoEstado = document.getElementById("c-end-estado");
if (campoEstado) campoEstado.addEventListener("input", () => (campoEstado.value = campoEstado.value.toUpperCase()));

/* ---------------------------------------------------------
   Inicialização
--------------------------------------------------------- */
updateConditionals();
renderProgress();

/* matrícula: só números, no máximo 8 */
// c-matricula é preenchida e travada após a identificação (não editável aqui)
