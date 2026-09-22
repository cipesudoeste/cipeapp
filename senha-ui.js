/* =========================================================
   SENHA-UI.JS — formulário de criar / alterar senha
   Usado por login.html, conta.html e enquete.html.
   SenhaUI.montar(container, sb, opcoes)
     opcoes: exigirAtual, email, titulo, texto, botao,
             pularTexto (mostra "Agora não"), aoConcluir(), aoPular()
   ========================================================= */
(function () {
  const css = `
  .su-box h2{font-family:var(--font-display);font-size:17px;font-weight:600;color:var(--ink);margin:0 0 6px;}
  .su-box p.su-txt{font-size:13px;color:var(--ink-muted);line-height:1.6;margin:0 0 14px;}
  .su-campo{position:relative;margin-bottom:10px;}
  .su-campo label{display:block;font-size:11.5px;color:var(--ink-faint);margin-bottom:5px;}
  .su-in{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:7px;color:var(--ink);
    padding:10px 64px 10px 12px;font-size:14px;font-family:inherit;}
  .su-in:focus{outline:none;border-color:var(--cipe-brown-l);}
  .su-ver{position:absolute;right:6px;bottom:6px;background:none;border:1px solid var(--line);border-radius:5px;
    color:var(--ink-faint);font-size:11px;padding:4px 7px;cursor:pointer;}
  .su-ver:hover{color:var(--accent);}
  .su-regras{list-style:none;margin:4px 0 12px;padding:0;font-size:12px;color:var(--ink-faint);}
  .su-regras li{padding:2px 0;} .su-regras li::before{content:"○ ";} .su-regras li.ok{color:#9fd08a;} .su-regras li.ok::before{content:"● ";}
  .su-acoes{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
  .su-acoes .ef-btn{justify-content:center;}
  .su-pular{background:none;border:none;color:var(--ink-faint);text-decoration:underline;cursor:pointer;font-size:12.5px;}
  .su-msg{font-size:12.5px;min-height:18px;margin-top:10px;color:var(--ink-muted);}
  .su-msg.erro{color:#e08a72;} .su-msg.ok{color:#9fd08a;}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const REGRAS = [
    ["min", "Pelo menos 8 caracteres", (s) => s.length >= 8],
    ["letra", "Pelo menos uma letra", (s) => /[A-Za-zÀ-ÿ]/.test(s)],
    ["num", "Pelo menos um número", (s) => /\d/.test(s)],
  ];

  function validar(nova, confirmacao) {
    const falha = REGRAS.find(([, , f]) => !f(nova));
    if (falha) return "A senha precisa ter: " + falha[1].toLowerCase() + ".";
    if (nova !== confirmacao) return "A confirmação não é igual à nova senha.";
    return null;
  }

  function campo(id, rotulo, auto) {
    return `<div class="su-campo"><label for="${id}">${rotulo}</label>
      <input class="su-in" id="${id}" type="password" autocomplete="${auto}">
      <button type="button" class="su-ver" data-ver="${id}">Mostrar</button></div>`;
  }

  function traduzir(msg) {
    if (/different from the old|should be different/i.test(msg)) return "A nova senha precisa ser diferente da atual.";
    if (/weak|at least|characters/i.test(msg)) return "Senha fraca. Use pelo menos 8 caracteres, com letras e números.";
    if (/reauthentication|recent/i.test(msg)) return "Por segurança, entre novamente com código e tente de novo.";
    return "Não foi possível salvar a senha: " + msg;
  }

  async function montar(container, sb, o) {
    o = o || {};
    container.innerHTML = `<div class="su-box">
      <h2>${o.titulo || "Criar senha"}</h2>
      ${o.texto ? `<p class="su-txt">${o.texto}</p>` : ""}
      ${o.exigirAtual ? campo("su-atual", "Senha atual", "current-password") : ""}
      ${campo("su-nova", "Nova senha", "new-password")}
      <ul class="su-regras">${REGRAS.map(([k, t]) => `<li data-r="${k}">${t}</li>`).join("")}</ul>
      ${campo("su-conf", "Repita a nova senha", "new-password")}
      <div class="su-acoes">
        <button type="button" class="ef-btn primary" id="su-salvar">${o.botao || "Salvar senha"}</button>
        ${o.pularTexto ? `<button type="button" class="su-pular" id="su-pular">${o.pularTexto}</button>` : ""}
      </div>
      <div class="su-msg" id="su-msg"></div>
    </div>`;
    const $ = (id) => container.querySelector("#" + id);
    const msg = (t, tipo) => { $("su-msg").textContent = t || ""; $("su-msg").className = "su-msg" + (tipo ? " " + tipo : ""); };

    container.querySelectorAll("[data-ver]").forEach((b) => b.addEventListener("click", () => {
      const i = $(b.dataset.ver);
      i.type = i.type === "password" ? "text" : "password";
      b.textContent = i.type === "password" ? "Mostrar" : "Ocultar";
    }));
    $("su-nova").addEventListener("input", () => {
      const s = $("su-nova").value;
      REGRAS.forEach(([k, , f]) => container.querySelector(`[data-r="${k}"]`).classList.toggle("ok", f(s)));
    });
    if (o.pularTexto) $("su-pular").addEventListener("click", () => o.aoPular && o.aoPular());
    (o.exigirAtual ? $("su-atual") : $("su-nova")).focus();

    async function salvar() {
      const nova = $("su-nova").value, conf = $("su-conf").value;
      const erro = validar(nova, conf);
      if (erro) return msg(erro, "erro");
      $("su-salvar").disabled = true;
      msg("Salvando…");
      if (o.exigirAtual) {
        const { error } = await sb.auth.signInWithPassword({ email: o.email, password: $("su-atual").value });
        if (error) { $("su-salvar").disabled = false; return msg("Senha atual incorreta.", "erro"); }
      }
      const { error } = await sb.auth.updateUser({ password: nova });
      $("su-salvar").disabled = false;
      if (error) return msg(traduzir(error.message), "erro");
      msg("Senha salva.", "ok");
      if (o.aoConcluir) setTimeout(o.aoConcluir, 600);
    }
    $("su-salvar").addEventListener("click", salvar);
    $("su-conf").addEventListener("keydown", (e) => { if (e.key === "Enter") salvar(); });
  }

  window.SenhaUI = { montar, validar };
})();
