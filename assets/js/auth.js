(function () {
  const { db } = window;
  const { toast } = window.U;

  /* ---------- Tabs ---------- */
  const tabs = document.querySelectorAll("[data-tab]");
  const forms = {
    login: document.getElementById("form-login"),
    cadastro: document.getElementById("form-cadastro"),
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      Object.entries(forms).forEach(([name, form]) => {
        if (form) form.hidden = name !== target;
      });
    });
  });

  /* ---------- Redireciona após autenticar ---------- */
  async function redirectByRole(userId) {
    const { data: perfil } = await db
      .from("perfis")
      .select("cargo")
      .eq("id", userId)
      .maybeSingle();

    window.location.href = perfil?.cargo === "admin" ? "admin/" : "agendamento-usuario.html";
  }

  /* ---------- Login ---------- */
  if (forms.login) {
    forms.login.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = forms.login.querySelector('button[type="submit"]');
      const email = document.getElementById("email").value.trim();
      const senha = document.getElementById("senha").value;

      if (!email || !senha) return toast("Preencha e-mail e senha.", "error");

      btn.disabled = true;
      btn.textContent = "Entrando...";

      const { data, error } = await db.auth.signInWithPassword({ email, password: senha });

      if (error) {
        btn.disabled = false;
        btn.textContent = "Entrar no Sistema";
        const msg =
          error.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos."
            : error.message;
        return toast(msg, "error");
      }

      toast("Login realizado!", "success");
      await redirectByRole(data.user.id);
    });
  }

  /* ---------- Cadastro ---------- */
  if (forms.cadastro) {
    forms.cadastro.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = forms.cadastro.querySelector('button[type="submit"]');
      const nome = document.getElementById("cad-nome").value.trim();
      const email = document.getElementById("cad-email").value.trim();
      const senha = document.getElementById("cad-senha").value;

      if (senha.length < 6) return toast("A senha deve ter pelo menos 6 caracteres.", "error");

      btn.disabled = true;
      btn.textContent = "Criando conta...";

      const { data, error } = await db.auth.signUp({
        email,
        password: senha,
        options: { data: { nome, cargo: "professor" } },
      });

      btn.disabled = false;
      btn.textContent = "Criar conta";

      if (error) return toast(error.message, "error");

      // Fallback: garante o registro em `perfis` (caso o trigger não exista)
      if (data.user) {
        await db.from("perfis").upsert(
          { id: data.user.id, nome, email, cargo: "professor" },
          { onConflict: "id" }
        );
      }

      if (data.session) {
        toast("Conta criada com sucesso!", "success");
        await redirectByRole(data.user.id);
      } else {
        toast("Conta criada! Confirme seu e-mail para entrar.", "info", 7000);
        document.querySelector('[data-tab="login"]')?.click();
      }
    });
  }
})();
