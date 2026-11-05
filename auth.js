(function () {
  var config = window.REIMFLOW_CONFIG;
  var hasConfig = config.supabaseUrl.indexOf("YOUR_") === -1 && config.supabasePublishableKey.indexOf("YOUR_") === -1;
  window.RF = { sb: null, user: null, profile: null, session: null, booted: false };

  function showLogin() {
    document.getElementById("auth-screen").classList.remove("is-hidden");
    document.getElementById("app-screen").classList.add("is-hidden");
  }

  async function showApp(session) {
    RF.session = session;
    RF.user = session.user;
    var result = await RF.sb.from("profiles").select("id, full_name, email, department_id, role, is_active, created_at, departments(department_name)").eq("id", RF.user.id).single();
    if (result.error) {
      if (result.error.code === "PGRST116") {
        throw new Error("Login Supabase berhasil, tetapi profil ReimFlow untuk akun ini belum dibuat. Tambahkan baris pengguna ini ke tabel profiles di Supabase.");
      }
      throw result.error;
    }
    if (!result.data) throw new Error("Profil akun belum tersedia. Hubungi administrator.");
    if (!result.data.is_active) {
      await RF.sb.auth.signOut();
      RF.session = null;
      RF.user = null;
      RF.profile = null;
      showLogin();
      document.getElementById("login-error").textContent = "Akun Anda tidak aktif. Hubungi administrator.";
      return;
    }
    RF.profile = result.data;
    document.getElementById("auth-screen").classList.add("is-hidden");
    document.getElementById("app-screen").classList.remove("is-hidden");
    document.getElementById("top-name").textContent = RF.profile.full_name;
    document.getElementById("top-role").textContent = RF.profile.role === "admin" ? "Admin / Finance" : "Karyawan";
    document.getElementById("top-avatar").textContent = RFUtil.initials(RF.profile.full_name);
    document.getElementById("today-label").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date());
    await RFApp.start();
  }

  async function initialize() {
    if (!hasConfig || !window.supabase) {
      showLogin();
      document.getElementById("login-error").textContent = "Lengkapi URL dan Publishable Key Supabase di config.js sebelum menggunakan aplikasi.";
      document.querySelector("#login-form button").disabled = true;
      return;
    }
    RF.sb = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    var form = document.getElementById("login-form");
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var button = form.querySelector("button");
      var error = document.getElementById("login-error");
      error.textContent = "";
      button.disabled = true;
      button.classList.add("is-loading");
      try {
        var data = new FormData(form);
        var result = await RF.sb.auth.signInWithPassword({ email: data.get("email"), password: data.get("password") });
        if (result.error) throw result.error;
        await showApp(result.data.session);
      } catch (reason) {
        error.textContent = reason.message || "Tidak dapat masuk. Periksa kembali kredensial Anda.";
      } finally {
        button.disabled = false;
        button.classList.remove("is-loading");
      }
    });
    document.getElementById("logout-button").innerHTML = RFUtil.icon("logout");
    document.getElementById("logout-button").addEventListener("click", async function () {
      var result = await RF.sb.auth.signOut();
      if (result.error) RFUtil.toast(result.error.message, "error");
      RF.profile = null;
      RF.user = null;
      RFApp.closeSidebar();
      showLogin();
    });
    var state = await RF.sb.auth.getSession();
    if (state.error) throw state.error;
    if (state.data.session) await showApp(state.data.session);
    else showLogin();
    RF.sb.auth.onAuthStateChange(function (_event, session) {
      if (!session) {
        RF.profile = null;
        RF.user = null;
        showLogin();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initialize().catch(function (error) {
      showLogin();
      document.getElementById("login-error").textContent = error.message || "Gagal memuat profil. Silakan coba lagi.";
    });
  });
})();
