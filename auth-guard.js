/* =========================================================
   AUTH-GUARD.JS — protege os painéis internos.
   Incluir DEPOIS de supabase-js e supabase-config.js e ANTES
   do script da página:
     <script src="auth-guard.js"></script>
   Só entra quem está logado E cadastrado na tabela "admins".
   ========================================================= */
(function () {
  // esconde a página até confirmar o acesso
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

  if (!window.supabase || typeof SUPABASE_URL === "undefined") {
    irParaLogin("config");
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sbAuth = client;

  async function verificar() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return irParaLogin();

    const { data: papel, error } = await client.rpc("meu_papel");
    if (error || !papel) {
      await client.auth.signOut();
      return irParaLogin("sem-acesso");
    }

    window.usuarioPapel = papel;
    window.usuarioEmail = session.user.email;
    document.documentElement.dataset.papel = papel;
    mostrarBarra(session.user.email, papel);
    const s = document.getElementById("auth-guard-hide");
    if (s) s.remove();
  }

  function mostrarBarra(email, papel) {
    const barra = document.createElement("div");
    barra.className = "auth-bar";
    barra.innerHTML =
      '<span class="auth-bar-user"></span>' +
      '<button type="button" class="auth-bar-sair">Sair</button>';
    barra.querySelector(".auth-bar-user").textContent = email + " · " + papel;
    barra.querySelector(".auth-bar-sair").addEventListener("click", async () => {
      await client.auth.signOut();
      location.replace("login.html");
    });
    const css = document.createElement("style");
    css.textContent =
      ".auth-bar{position:fixed;right:10px;bottom:10px;z-index:9999;display:flex;align-items:center;gap:8px;" +
      "background:var(--bg-panel,#2f3326);border:1px solid var(--line,#454c3a);border-radius:8px;padding:6px 8px 6px 12px;" +
      "font-family:var(--font-mono,monospace);font-size:10.5px;color:var(--ink-muted,#b7bba6);box-shadow:0 4px 14px rgba(0,0,0,.35);}" +
      ".auth-bar-sair{font:inherit;text-transform:uppercase;letter-spacing:.04em;background:transparent;color:var(--accent,#bfae8c);" +
      "border:1px solid var(--line,#454c3a);border-radius:5px;padding:4px 8px;cursor:pointer;}" +
      ".auth-bar-sair:hover{border-color:var(--accent,#bfae8c);}" +
      "@media print{.auth-bar{display:none;}}";
    document.head.appendChild(css);
    const add = () => document.body.appendChild(barra);
    document.body ? add() : document.addEventListener("DOMContentLoaded", add);
  }

  // se a sessão cair (logout em outra aba, expirou), volta pro login
  client.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_OUT") irParaLogin();
  });

  verificar().catch((e) => {
    console.error(e);
    irParaLogin("erro");
  });
})();
