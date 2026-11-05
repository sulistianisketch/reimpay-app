(function () {
  var adminNav = [
    { section: "OVERVIEW" },
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { section: "PENGELOLAAN" },
    { id: "reimbursements", label: "Pengajuan", icon: "receipt" },
    { id: "payments", label: "Pembayaran", icon: "card" },
    { id: "journal", label: "Jurnal Transaksi", icon: "chart" },
    { section: "MASTER DATA" },
    { id: "employees", label: "Karyawan", icon: "users" },
    { id: "departments", label: "Departemen", icon: "building" },
    { id: "categories", label: "Kategori", icon: "tag" },
    { section: "LAINNYA" },
    { id: "reports", label: "Laporan", icon: "chart" },
    { id: "activity", label: "Riwayat Aktivitas", icon: "clock" }
  ];
  var employeeNav = [
    { section: "MENU UTAMA" },
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "new", label: "Ajukan Reimbursement", icon: "plus" },
    { id: "history", label: "Riwayat Pengajuan", icon: "receipt" },
    { section: "AKUN" },
    { id: "profile", label: "Profil Saya", icon: "user" }
  ];
  var titles = {
    dashboard: "Dashboard", new: "Ajukan Reimbursement", history: "Riwayat Pengajuan",
    reimbursements: "Pengajuan Reimbursement", payments: "Pembayaran", journal: "Jurnal Transaksi",
    employees: "Master Karyawan", departments: "Master Departemen", categories: "Master Kategori",
    reports: "Laporan", activity: "Riwayat Aktivitas", profile: "Profil Saya"
  };
  window.RFApp = {
    currentView: "dashboard",
    async start() {
      this.renderNav();
      this.bindShell();
      await this.go("dashboard");
    },
    renderNav() {
      var isAdmin = RF.profile.role === "admin";
      var nav = isAdmin ? adminNav : employeeNav;
      document.getElementById("sidebar-nav").innerHTML = nav.map(function (item) {
        return item.section
          ? '<div class="nav-section">' + item.section + "</div>"
          : '<a href="#" class="nav-link" data-view="' + item.id + '">' + RFUtil.icon(item.icon) + "<span>" + item.label + "</span></a>";
      }).join("");
    },
    bindShell() {
      var self = this;
      document.getElementById("sidebar-nav").onclick = function (event) {
        var link = event.target.closest("[data-view]");
        if (!link) return;
        event.preventDefault();
        self.go(link.dataset.view);
        self.closeSidebar();
      };
      document.querySelector(".sidebar-brand .brand").onclick = function (event) {
        event.preventDefault();
        self.go("dashboard");
      };
      document.getElementById("sidebar-toggle").innerHTML = RFUtil.icon("menu");
      document.getElementById("sidebar-close").innerHTML = RFUtil.icon("close");
      document.getElementById("sidebar-toggle").onclick = function () {
        document.getElementById("sidebar").classList.add("sidebar-open");
        document.getElementById("sidebar-scrim").classList.add("is-visible");
      };
      document.getElementById("sidebar-close").onclick = function () { self.closeSidebar(); };
      document.getElementById("sidebar-scrim").onclick = function () { self.closeSidebar(); };
      document.getElementById("app-modal").addEventListener("click", function (event) {
        if (event.target === this) this.close();
      });
    },
    closeSidebar() {
      document.getElementById("sidebar").classList.remove("sidebar-open");
      document.getElementById("sidebar-scrim").classList.remove("is-visible");
    },
    async go(view) {
      var allowed = (RF.profile.role === "admin" ? adminNav : employeeNav).some(function (item) { return item.id === view; });
      if (!allowed) view = "dashboard";
      this.currentView = view;
      document.getElementById("current-page-title").textContent = titles[view] || "Dashboard";
      document.querySelectorAll(".nav-link").forEach(function (link) { link.classList.toggle("active", link.dataset.view === view); });
      var container = document.getElementById("page-content");
      container.innerHTML = '<div class="loading"><span class="spinner"></span>Memuat data...</div>';
      container.setAttribute("aria-busy", "true");
      try {
        if (view === "dashboard") await this.renderDashboard(container);
        else await RFViews[view](container);
      } catch (error) {
        container.innerHTML = '<div class="inline-error">Data gagal dimuat: ' + RFUtil.escape(error.message) + "</div>";
      } finally {
        container.setAttribute("aria-busy", "false");
      }
    },
    async renderDashboard(container) {
      if (RF.profile.role === "admin") return renderAdminDashboard(container);
      return renderEmployeeDashboard(container);
    }
  };

  function checked(result) {
    if (result.error) throw result.error;
    return result.data || [];
  }
  function pageHeading(title, subtitle, action) {
    return '<div class="page-heading"><div><p class="eyebrow">REIMFLOW WORKSPACE</p><h1>' + title + '</h1><p>' + subtitle + "</p></div>" + (action || "") + "</div>";
  }
  function dashboardHero() {
    return '<section class="dashboard-hero" aria-label="Ilustrasi konsultasi bisnis dan layanan digital"><img src="business-consulting.svg" alt="Tim profesional berdiskusi menggunakan solusi digital"></section>';
  }
  function stat(label, value, icon, caption) {
    return '<article class="stat-card"><div class="stat-top"><span>' + label + '</span><span class="stat-icon">' + RFUtil.icon(icon) + '</span></div><strong>' + value + '</strong><small>' + caption + "</small></article>";
  }
  function emptyTable(message) {
    return '<tr><td colspan="7"><div class="empty-state"><strong>Belum ada data</strong>' + message + "</div></td></tr>";
  }
  function reimbursementRow(row, showEmployee) {
    return "<tr><td><strong>" + RFUtil.escape(row.request_number) + "</strong></td>" +
      (showEmployee ? "<td>" + RFUtil.escape(row.profiles && row.profiles.full_name || "—") + "</td>" : "") +
      "<td>" + RFUtil.date(row.transaction_date) + "</td><td>" + RFUtil.escape(row.category) + "</td><td><strong>" + RFUtil.money(row.amount) + "</strong></td><td>" + RFUtil.status(row.status) + '</td><td><button class="table-link" data-detail="' + row.id + '">Detail</button></td></tr>';
  }
  function tableMarkup(rows, showEmployee) {
    return '<div class="table-wrap"><table><thead><tr><th>NO. PENGAJUAN</th>' + (showEmployee ? "<th>KARYAWAN</th>" : "") + "<th>TANGGAL</th><th>KATEGORI</th><th>NOMINAL</th><th>STATUS</th><th></th></tr></thead><tbody>" +
      (rows.length ? rows.map(function (row) { return reimbursementRow(row, showEmployee); }).join("") : emptyTable("Pengajuan yang dibuat akan muncul di sini.")) + "</tbody></table></div>";
  }
  async function renderEmployeeDashboard(container) {
    var result = checked(await RF.sb.from("reimbursements").select("id, request_number, transaction_date, category, amount, status, created_at").eq("employee_id", RF.user.id).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }));
    var count = { total: result.length, pending: 0, approved: 0, rejected: 0, paid: 0 };
    result.forEach(function (row) {
      if (row.status === "Menunggu Persetujuan") count.pending++;
      if (row.status === "Disetujui") count.approved++;
      if (row.status === "Ditolak") count.rejected++;
      if (row.status === "Dibayarkan") count.paid++;
    });
    container.innerHTML = pageHeading("Halo, " + RFUtil.escape(RF.profile.full_name.split(" ")[0]), "Berikut ringkasan pengajuan reimbursement Anda.") +
      dashboardHero() +
      '<div class="stats-grid stats-grid-employee">' + stat("Total Pengajuan", count.total, "receipt", "Seluruh pengajuan Anda") + stat("Menunggu Persetujuan", count.pending, "clock", "Sedang ditinjau Finance") + stat("Disetujui", count.approved, "chart", "Siap untuk dibayarkan") + stat("Ditolak", count.rejected, "users", "Alasan penolakan tersedia") + stat("Sudah Dibayarkan", count.paid, "card", "Pembayaran tercatat") + '</div>' +
      '<section class="reimbursement-flow"><div class="flow-heading"><span class="flow-heading-icon">' + RFUtil.icon("chart") + '</span><div><h2>Alur reimbursement</h2><p>Proses pengajuan Anda, dari awal hingga pembayaran.</p></div></div><div class="flow-steps"><div class="flow-step"><span>01</span><strong>Diajukan</strong></div><i></i><div class="flow-step"><span>02</span><strong>Ditinjau Finance</strong></div><i></i><div class="flow-step"><span>03</span><strong>Disetujui</strong></div><i></i><div class="flow-step"><span>04</span><strong>Dibayarkan</strong></div></div></section>' +
      '<section class="panel"><div class="panel-header"><div><h2>Pengajuan Terbaru</h2><p>Pantau status reimbursement Anda</p></div><button class="link-button" data-quick-view="history">Lihat semua →</button></div>' + tableMarkup(result.slice(0, 5), false) + "</section>";
    bindDashboardActions();
  }
  async function renderAdminDashboard(container) {
    var result = checked(await RF.sb.from("reimbursements").select("id, request_number, employee_id, transaction_date, category, amount, status, created_at, profiles!reimbursements_employee_id_fkey(full_name, departments(department_name))").order("transaction_date", { ascending: false }).order("created_at", { ascending: false }));
    var payments = checked(await RF.sb.from("payments").select("paid_amount"));
    var people = checked(await RF.sb.from("profiles").select("id, role"));
    var directory = await RF.sb.from("employee_directory").select("id", { count: "exact", head: true });
    if (directory.error) throw directory.error;
    var departmentCount = await RF.sb.from("departments").select("id", { count: "exact", head: true });
    if (departmentCount.error) throw departmentCount.error;
    var count = { total: result.length, pending: 0, approved: 0, rejected: 0, paid: 0 };
    var monthly = new Array(6).fill(0);
    var now = new Date();
    result.forEach(function (row) {
      if (row.status === "Menunggu Persetujuan") count.pending++;
      if (row.status === "Disetujui") count.approved++;
      if (row.status === "Ditolak") count.rejected++;
      if (row.status === "Dibayarkan") count.paid++;
      var date = new Date(row.transaction_date + "T00:00:00");
      var offset = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
      if (offset >= 0 && offset < 6) monthly[5 - offset] += Number(row.amount);
    });
    var max = Math.max.apply(null, monthly.concat([1]));
    var chart = monthly.map(function (amount, index) {
      var date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      var label = new Intl.DateTimeFormat("id-ID", { month: "short" }).format(date);
      return '<div class="chart-month"><div class="chart-bars"><span class="chart-bar' + (index === 5 ? " current" : "") + '" style="height:' + Math.max(3, amount / max * 100) + '%" title="' + RFUtil.money(amount) + '"></span></div>' + label + "</div>";
    }).join("");
    var latest = result.slice(0, 5);
    container.innerHTML = pageHeading("Ringkasan Dashboard", "Pantau alur reimbursement Sinergi Karya.") +
      dashboardHero() +
      '<div class="stats-grid">' + stat("Total Pengajuan", count.total, "receipt", "Seluruh waktu") + stat("Menunggu Persetujuan", count.pending, "clock", "Perlu ditinjau") + stat("Disetujui", count.approved, "chart", "Menunggu pembayaran") + stat("Ditolak", count.rejected, "users", count.paid + " telah dibayarkan") + '</div>' +
      '<div class="stats-grid">' + stat("Total Pembayaran", RFUtil.money(payments.reduce(function (sum, p) { return sum + Number(p.paid_amount); }, 0)), "card", payments.length + " transaksi pembayaran") + stat("Pengajuan Dibayarkan", count.paid, "receipt", "Status pembayaran tersimpan") + stat("Karyawan", people.filter(function (person) { return person.role === "employee"; }).length + (directory.count || 0), "users", "Termasuk data tanpa akun login") + stat("Departemen", departmentCount.count || 0, "building", "Master data perusahaan") + '</div>' +
      '<div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h2>Tren Pengajuan</h2><p>Nominal berdasarkan tanggal transaksi · 6 bulan terakhir</p></div><div class="chart-legend"><span><i class="legend-dot teal"></i>Nominal</span></div></div><div class="chart-wrap"><div class="bar-chart">' + chart + '</div></div></section><section class="panel"><div class="panel-header"><div><h2>Perlu Perhatian</h2><p>Ringkasan status pengajuan</p></div></div><div class="panel-body"><div class="activity-list"><div class="activity-item"><span class="activity-marker">' + RFUtil.icon("clock") + '</span><div class="activity-text"><strong>Menunggu persetujuan</strong><small>Perlu pemeriksaan bukti transaksi</small></div><strong>' + count.pending + '</strong></div><div class="activity-item"><span class="activity-marker">' + RFUtil.icon("card") + '</span><div class="activity-text"><strong>Siap dibayarkan</strong><small>Pengajuan telah disetujui</small></div><strong>' + count.approved + '</strong></div></div></div></section></div>' +
      '<section class="panel" style="margin-top:16px"><div class="panel-header"><div><h2>Pengajuan Terbaru</h2><p>Aktivitas pengajuan reimbursement terbaru</p></div><button class="link-button" data-quick-view="reimbursements">Lihat semua →</button></div>' + tableMarkup(latest, true) + "</section>";
    bindDashboardActions();
  }
  function bindDashboardActions() {
    document.querySelectorAll("[data-quick-view]").forEach(function (button) {
      button.onclick = function () { RFApp.go(button.dataset.quickView); };
    });
    document.querySelectorAll("[data-detail]").forEach(function (button) {
      button.onclick = function () { RFViews.showReimbursement(button.dataset.detail, RF.profile.role === "admin"); };
    });
  }
  window.RFDashboardHelpers = { checked: checked, pageHeading: pageHeading, stat: stat, tableMarkup: tableMarkup, emptyTable: emptyTable, reimbursementRow: reimbursementRow };
})();
