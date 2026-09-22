/* =========================================================
   AUTH-GUARD.JS — protege os painéis internos.
   Incluir DEPOIS de supabase-js e supabase-config.js e ANTES
   do script da página, dizendo qual painel é:
     <script src="auth-guard.js" data-painel="efetivo"></script>
   Painéis: efetivo, cadastros, oficios, viaturas, whatsapp, usuarios
   ("usuarios" é só para master).
   Expõe: window.sbAuth, window.usuarioAcesso, window.podeEditar
   ========================================================= */
(function () {
  const painel = (document.currentScript && document.currentScript.dataset.painel) || "";

  const style = document.createElement("style");
  style.id = "auth-guard-hide";
  style.textContent = "body{visibility:hidden !important;}";
  document.head.appendChild(style);

  const destino = location.pathname.split("/").pop() || "index.html";
  function irParaLogin(motivo) {
    const q = new URLSearchParams({ next: destino + location.search });
    if (motivo) q.set("motivo", motivo);
    location.replace("login.html?" + q.toString());
  }

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return irParaLogin("config");

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sbAuth = client;

  function nivel(acesso) {
    if (!acesso) return null;
    if (acesso.papel === "master") return "editar";
    if (painel === "usuarios") return null;
    const n = (acesso.permissoes || {})[painel];
    return n === "editar" || n === "ver" ? n : null;
  }

  function onReady(fn) {
    document.body ? fn() : document.addEventListener("DOMContentLoaded", fn);
  }

  function telaSemAcesso(email) {
    onReady(() => {
      document.body.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">' +
        '<div style="max-width:380px;text-align:center;background:var(--bg-panel,#2f3326);border:1px solid var(--line,#454c3a);border-radius:12px;padding:28px 24px;">' +
        '<div style="font-family:var(--font-display,sans-serif);font-size:19px;color:var(--ink,#eef0e4);margin-bottom:8px;">Sem acesso a este painel</div>' +
        '<p style="font-size:13px;color:var(--ink-muted,#b7bba6);line-height:1.6;margin:0 0 18px;">A conta <b class="sa-email"></b> não tem permissão para este painel. Peça liberação ao administrador.</p>' +
        '<div style="display:flex;gap:8px;justify-content:center;">' +
        '<a href="index.html" class="ef-btn">Início</a>' +
        '<button type="button" class="ef-btn primary sa-sair">Trocar de conta</button></div></div></div>';
      document.body.querySelector(".sa-email").textContent = email;
      document.body.querySelector(".sa-sair").addEventListener("click", async () => {
        await client.auth.signOut();
        location.replace("login.html?next=" + encodeURIComponent(destino));
      });
      const s = document.getElementById("auth-guard-hide");
      if (s) s.remove();
    });
  }

  async function verificar() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return irParaLogin();

    const { data: acesso, error } = await client.rpc("meu_acesso");
    if (error || !acesso) {
      await client.auth.signOut();
      return irParaLogin("sem-acesso");
    }
    const n = nivel(acesso);
    if (!n) return telaSemAcesso(session.user.email);

    window.usuarioAcesso = acesso;
    window.podeEditar = n === "editar";
    document.documentElement.dataset.nivel = n;
    mostrarBarra(acesso, n);
    document.dispatchEvent(new CustomEvent("auth-pronto", { detail: { acesso, nivel: n } }));
    const s = document.getElementById("auth-guard-hide");
    if (s) s.remove();
  }

  function mostrarBarra(acesso, n) {
    const barra = document.createElement("div");
    barra.className = "auth-bar";
    barra.innerHTML =
      '<span class="auth-bar-user"></span>' +
      (acesso.papel === "master" && painel !== "usuarios"
        ? '<a class="auth-bar-btn" href="usuarios.html">Usuários</a>' : "") +
      '<button type="button" class="auth-bar-btn auth-bar-sair">Sair</button>';
    barra.querySelector(".auth-bar-user").textContent =
      acesso.email + " · " + (acesso.papel === "master" ? "master" : n === "editar" ? "edita" : "só leitura");
    barra.querySelector(".auth-bar-sair").addEventListener("click", async () => {
      await client.auth.signOut();
      location.replace("login.html");
    });
    const css = document.createElement("style");
    css.textContent =
      ".auth-bar{position:fixed;right:10px;bottom:10px;z-index:9999;display:flex;align-items:center;gap:8px;" +
      "background:var(--bg-panel,#2f3326);border:1px solid var(--line,#454c3a);border-radius:8px;padding:6px 8px 6px 12px;" +
      "font-family:var(--font-mono,monospace);font-size:10.5px;color:var(--ink-muted,#b7bba6);box-shadow:0 4px 14px rgba(0,0,0,.35);}" +
      ".auth-bar-btn{font:inherit;text-transform:uppercase;letter-spacing:.04em;background:transparent;color:var(--accent,#bfae8c);" +
      "border:1px solid var(--line,#454c3a);border-radius:5px;padding:4px 8px;cursor:pointer;text-decoration:none;}" +
      ".auth-bar-btn:hover{border-color:var(--accent,#bfae8c);}" +
      "@media print{.auth-bar{display:none;}}";
    document.head.appendChild(css);
    onReady(() => document.body.appendChild(barra));
  }

  client.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_OUT") irParaLogin();
  });

  verificar().catch((e) => {
    console.error(e);
    irParaLogin("erro");
  });
})();
