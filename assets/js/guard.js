(function () {
  const { db } = window;

  async function getSession() {
    const { data, error } = await db.auth.getSession();
    if (error) return null;
    return data.session || null;
  }

  async function getPerfil(userId) {
    const { data } = await db.from("perfis").select("*").eq("id", userId).maybeSingle();
    return data || null;
  }

  async function requireAuth(redirect = "login.html") {
    const session = await getSession();
    if (!session) {
      window.location.href = redirect;
      return null;
    }
    return session;
  }

  async function requireAdmin(redirect = "../admin-login.html") {
    const session = await getSession();
    if (!session) {
      window.location.href = redirect;
      return null;
    }
    const perfil = await getPerfil(session.user.id);
    if (!perfil || perfil.cargo !== "admin") {
      window.location.href = redirect;
      return null;
    }
    return { session, perfil };
  }

  async function logout(redirect = "index.html") {
    await db.auth.signOut();
    window.location.href = redirect;
  }

  /**
   * Renderiza área de usuário no cabeçalho.
   * opts: { loginHref, painelHref, adminHref, afterLogout }
   */
  async function renderHeaderUser(selector, opts = {}) {
    const el = document.querySelector(selector);
    if (!el) return;

    const session = await getSession();

    if (!session) {
      el.innerHTML = `<a class="btn btn-ghost" href="${opts.loginHref || "login.html"}">Entrar</a>`;
      return;
    }

    const perfil = await getPerfil(session.user.id);
    const rawNome = perfil?.nome || session.user.email || "Usuário";
    const nome = rawNome.split(" ")[0];
    const painel =
      perfil?.cargo === "admin"
        ? opts.adminHref || "admin/"
        : opts.painelHref || "agendamento-usuario.html";

    el.innerHTML = `
      <a class="btn btn-ghost" href="${painel}">${window.U.escapeHtml(nome)}</a>
      <button class="btn btn-ghost" id="btn-logout" type="button">Sair</button>
    `;

    el.querySelector("#btn-logout").addEventListener("click", () =>
      logout(opts.afterLogout || "index.html")
    );
  }

  window.Auth = { getSession, getPerfil, requireAuth, requireAdmin, logout, renderHeaderUser };
})();
