(function () {
  var H = window.RFDashboardHelpers;
  function fail(result) { if (result.error) throw result.error; return result.data || []; }
  function head(title, subtitle, action) { return H.pageHeading(title, subtitle, action || ""); }
  function simpleTable(title, subtitle, headers, rows, empty) {
    return '<section class="panel"><div class="panel-header"><div><h2>' + title + '</h2><p>' + subtitle + "</p></div></div><div class=\"table-wrap\"><table><thead><tr>" + headers.map(function (item) { return "<th>" + item + "</th>"; }).join("") + "</tr></thead><tbody>" + (rows.length ? rows.join("") : '<tr><td colspan="' + headers.length + '"><div class="empty-state"><strong>Belum ada data</strong>' + empty + "</div></td></tr>") + "</tbody></table></div></section>";
  }
  function openModal(title, html) {
    var dialog = document.getElementById("app-modal");
    dialog.innerHTML = '<div class="modal-head"><h2>' + title + '</h2><button class="icon-button" data-modal-close aria-label="Tutup">' + RFUtil.icon("close") + '</button></div><div class="modal-body">' + html + "</div>";
    dialog.querySelector("[data-modal-close]").onclick = function () { dialog.close(); };
    dialog.showModal();
    return dialog;
  }
  async function departments(container) {
    var rows = fail(await RF.sb.from("departments").select("id, department_name, created_at").order("department_name"));
    var tableRows = rows.map(function (row) {
      return "<tr><td><strong>" + RFUtil.escape(row.department_name) + "</strong></td><td>" + RFUtil.date(row.created_at) + '</td><td><button class="link-button" data-edit-department="' + row.id + '">Ubah</button><button class="link-button" style="margin-left:10px;color:#c75555" data-delete-department="' + row.id + '">Hapus</button></td></tr>';
    });
    container.innerHTML = head("Master Departemen", "Kelola daftar departemen perusahaan.", '<button class="button button-primary" data-add-department>' + RFUtil.icon("plus") + " Tambah Departemen</button>") + simpleTable("Daftar Departemen", rows.length + " departemen terdaftar.", ["NAMA DEPARTEMEN", "DIBUAT", "AKSI"], tableRows, "Tambahkan departemen pertama.");
    container.querySelector("[data-add-department]").onclick = function () { editDepartment(); };
    container.querySelectorAll("[data-edit-department]").forEach(function (button) {
      button.onclick = function () { editDepartment(rows.find(function (row) { return row.id === button.dataset.editDepartment; })); };
    });
    container.querySelectorAll("[data-delete-department]").forEach(function (button) {
      button.onclick = async function () {
        var row = rows.find(function (item) { return item.id === button.dataset.deleteDepartment; });
        if (!confirm('Hapus departemen "' + row.department_name + '"? Departemen yang masih digunakan oleh profil tidak dapat dihapus.')) return;
        var result = await RF.sb.from("departments").delete().eq("id", row.id);
        if (result.error) { RFUtil.toast("Departemen gagal dihapus: " + result.error.message, "error"); return; }
        RFUtil.toast("Departemen berhasil dihapus.");
        await RFApp.go("departments");
      };
    });
  }
  function editDepartment(row) {
    var dialog = openModal(row ? "Ubah Departemen" : "Tambah Departemen", '<form id="department-form" class="form-stack"><label>Nama departemen<input name="department_name" maxlength="100" required value="' + RFUtil.escape(row && row.department_name || "") + '"></label><div class="modal-actions"><button type="button" class="button button-secondary" data-modal-close>Batal</button><button class="button button-primary" type="submit">Simpan</button></div><p class="form-error" id="department-error"></p></form>');
    dialog.querySelector("[data-modal-close]").onclick = function () { dialog.close(); };
    dialog.querySelector("#department-form").onsubmit = async function (event) {
      event.preventDefault();
      var name = new FormData(event.currentTarget).get("department_name").trim();
      var result = row
        ? await RF.sb.from("departments").update({ department_name: name }).eq("id", row.id)
        : await RF.sb.from("departments").insert({ department_name: name });
      if (result.error) { dialog.querySelector("#department-error").textContent = result.error.message; return; }
      dialog.close();
      RFUtil.toast("Data departemen berhasil disimpan.");
      await RFApp.go("departments");
    };
  }
  async function profiles() {
    return fail(await RF.sb.from("profiles").select("id, full_name, email, role, department_id, is_active, created_at, departments(department_name)").order("full_name"));
  }
  async function employees(container) {
    var results = await Promise.all([
      profiles(),
      RF.sb.from("employee_directory").select("id, full_name, email, department_id, created_at, departments(department_name)").order("full_name"),
      RF.sb.from("departments").select("id, department_name").order("department_name")
    ]);
    var rows = results[0].filter(function (row) { return row.role === "employee"; });
    var directoryRows = fail(results[1]);
    var departmentsList = fail(results[2]);
    var tr = directoryRows.map(function (row) {
      return "<tr><td><strong>" + RFUtil.escape(row.full_name) + "</strong></td><td>" + RFUtil.escape(row.email || "—") + "</td><td>" + RFUtil.escape(row.departments && row.departments.department_name || "—") + "</td><td>" + RFUtil.date(row.created_at) + "</td></tr>";
    }).concat(rows.map(function (row) {
      return "<tr><td><strong>" + RFUtil.escape(row.full_name) + "</strong></td><td>" + RFUtil.escape(row.email) + "</td><td>" + RFUtil.escape(row.departments && row.departments.department_name || "—") + "</td><td>" + RFUtil.date(row.created_at) + "</td></tr>";
    }));
    container.innerHTML = head("Master Karyawan", "Data karyawan dan departemen.", '<button class="button button-primary" data-create-employee>' + RFUtil.icon("plus") + " Tambah Karyawan</button>") + simpleTable("Daftar Karyawan", (rows.length + directoryRows.length) + " karyawan terdata.", ["NAMA KARYAWAN", "EMAIL", "DEPARTEMEN", "DITAMBAHKAN"], tr, "Tambahkan data karyawan untuk memulai.");
    container.querySelector("[data-create-employee]").onclick = function () { createEmployeeForm(departmentsList); };
  }
  function createEmployeeForm(departmentsList) {
    var dialog = openModal("Tambah Data Karyawan", '<form id="employee-form" class="form-stack"><label>Nama lengkap<input name="full_name" maxlength="120" required></label><label>Email kerja <span class="field-hint">Opsional, hanya untuk data karyawan.</span><input name="email" type="email" maxlength="254" autocomplete="off"></label><label>Departemen<select name="department_id" required><option value="">Pilih departemen</option>' + departmentsList.map(function (department) { return '<option value="' + department.id + '">' + RFUtil.escape(department.department_name) + "</option>"; }).join("") + '</select></label><div class="note">Data ini tidak membuat akun login. Riwayat contoh yang dibuat akan tampil pada bagian Simulasi di dashboard admin.</div><div class="modal-actions"><button type="button" class="button button-secondary" data-modal-close>Batal</button><button type="submit" class="button button-primary">Simpan Data Karyawan</button></div><p class="form-error" id="employee-error" role="alert"></p></form>');
    var form = dialog.querySelector("#employee-form");
    form.onsubmit = async function (event) {
      event.preventDefault();
      var values = new FormData(form);
      var submitButton = form.querySelector('[type="submit"]');
      var errorElement = dialog.querySelector("#employee-error");
      submitButton.disabled = true;
      errorElement.textContent = "";
      try {
        var result = await RF.sb.rpc("create_employee_directory_with_demo_history", {
          p_full_name: String(values.get("full_name")).trim(),
          p_email: String(values.get("email")).trim() || null,
          p_department_id: values.get("department_id")
        });
        if (result.error) throw result.error;
        dialog.close();
        RFUtil.toast("Data karyawan dan riwayat simulasi berhasil disimpan.");
        await RFApp.go("employees");
      } catch (error) {
        errorElement.textContent = "Karyawan gagal ditambahkan: " + error.message;
        submitButton.disabled = false;
      }
    };
  }
  async function categories(container) {
    container.innerHTML = head("Master Kategori", "Kategori pengeluaran yang tersedia untuk pengajuan.") +
      '<div class="note" style="margin-bottom:16px">Daftar kategori dikendalikan melalui config.js agar tetap konsisten dengan batasan skema empat tabel. Kategori disimpan sebagai teks pada reimbursement.category; tidak ada tabel kategori tambahan.</div>' +
      simpleTable("Kategori Pengeluaran", window.REIMFLOW_CATEGORIES.length + " kategori tersedia.", ["KATEGORI", "DIGUNAKAN UNTUK"], window.REIMFLOW_CATEGORIES.map(function (category) {
        return "<tr><td><strong>" + RFUtil.escape(category) + "</strong></td><td>Pengajuan reimbursement</td></tr>";
      }), "Kategori belum dikonfigurasi.");
  }
  async function profile(container) {
    var row = RF.profile;
    container.innerHTML = head("Profil Saya", "Informasi akun yang terdaftar di ReimFlow.") +
      '<div class="profile-grid"><section class="panel profile-card"><div class="profile-avatar">' + RFUtil.initials(row.full_name) + '</div><h2>' + RFUtil.escape(row.full_name) + '</h2><p>' + RFUtil.escape(row.role === "admin" ? "Admin / Finance" : "Karyawan") + "</p></section>" +
      '<section class="panel"><div class="panel-header"><div><h2>Informasi Profil</h2><p>Nama yang ditampilkan dapat Anda perbarui.</p></div></div><div class="panel-body"><form id="profile-form" class="form-stack"><label>Nama lengkap<input name="full_name" maxlength="120" value="' + RFUtil.escape(row.full_name) + '" required></label><label>Email<input value="' + RFUtil.escape(row.email) + '" disabled></label><label>Departemen<input value="' + RFUtil.escape(row.departments && row.departments.department_name || "—") + '" disabled></label><label>Role<input value="' + RFUtil.escape(row.role === "admin" ? "Admin / Finance" : "Karyawan") + '" disabled></label><div class="form-actions"><button type="submit" class="button button-primary">Simpan Perubahan</button></div><p id="profile-error" class="form-error"></p></form></div></section></div>';
    container.querySelector("#profile-form").onsubmit = async function (event) {
      event.preventDefault();
      var name = new FormData(event.currentTarget).get("full_name").trim();
      var result = await RF.sb.from("profiles").update({ full_name: name }).eq("id", RF.user.id);
      if (result.error) { container.querySelector("#profile-error").textContent = result.error.message; return; }
      RF.profile.full_name = name;
      document.getElementById("top-name").textContent = name;
      document.getElementById("top-avatar").textContent = RFUtil.initials(name);
      RFUtil.toast("Profil berhasil diperbarui.");
    };
  }
  async function activity(container) {
    var reimbursements = fail(await RF.sb.from("reimbursements").select("id, request_number, employee_id, status, created_at, reviewed_at, profiles!reimbursements_employee_id_fkey(full_name), reviewer:profiles!reimbursements_reviewed_by_fkey(full_name)").order("created_at", { ascending: false }).limit(100));
    var payments = fail(await RF.sb.from("payments").select("id, reimbursement_id, paid_by, payment_date, created_at, reimbursements(request_number), profiles!payments_paid_by_fkey(full_name)").order("created_at", { ascending: false }).limit(100));
    var activities = [];
    reimbursements.forEach(function (row) {
      activities.push({ time: row.created_at, name: row.profiles.full_name, text: "mengajukan " + row.request_number, icon: "receipt" });
      if (row.reviewed_at) activities.push({ time: row.reviewed_at, name: row.reviewer && row.reviewer.full_name || "Admin", text: "mengubah status " + row.request_number + " menjadi " + row.status, icon: row.status === "Ditolak" ? "close" : "chart" });
    });
    payments.forEach(function (row) {
      activities.push({ time: row.created_at, name: row.profiles.full_name, text: "mencatat pembayaran " + row.reimbursements.request_number, icon: "card" });
    });
    activities.sort(function (a, b) { return new Date(b.time) - new Date(a.time); });
    var rows = activities.slice(0, 100).map(function (item) {
      return '<tr><td>' + RFUtil.dateTime(item.time) + '</td><td><strong>' + RFUtil.escape(item.name) + "</strong></td><td>" + RFUtil.icon(item.icon) + " " + RFUtil.escape(item.text) + "</td></tr>";
    });
    container.innerHTML = head("Riwayat Aktivitas", "Aktivitas yang dapat diturunkan dari pengajuan dan pembayaran.") +
      '<div class="note" style="margin-bottom:16px">Riwayat ini merupakan ringkasan dari empat tabel transaksi, bukan audit trail immutable. Untuk audit lengkap (misalnya perubahan status berulang), diperlukan tabel audit tambahan di luar batasan empat entitas utama.</div>' +
      simpleTable("Aktivitas Terbaru", activities.length + " peristiwa tersedia.", ["WAKTU", "PENGGUNA", "AKTIVITAS"], rows, "Belum ada aktivitas.");
  }
  async function journal(container) {
    var result = fail(await RF.sb.from("payments").select("payment_date, paid_amount, payment_reference, reimbursements(request_number, category, profiles!reimbursements_employee_id_fkey(full_name))").order("payment_date", { ascending: false }));
    var totalDebit = result.reduce(function (sum, p) { return sum + Number(p.paid_amount); }, 0);
    var rows = [];
    result.forEach(function (payment) {
      var request = payment.reimbursements;
      rows.push('<tr class="journal-row journal-debit"><td rowspan="2"><span class="journal-date">' + RFUtil.date(payment.payment_date) + '</span></td><td rowspan="2"><strong>' + RFUtil.escape(request.request_number) + '</strong><span class="journal-cell-caption">' + RFUtil.escape(payment.payment_reference) + '</span></td><td rowspan="2">' + RFUtil.escape(request.profiles.full_name) + '</td><td rowspan="2"><span class="journal-category">' + RFUtil.escape(request.category) + '</span></td><td><span class="journal-account"><span class="journal-account-dot debit"></span>Beban reimbursement</span></td><td class="journal-amount debit-amount">' + RFUtil.money(payment.paid_amount) + '</td><td class="journal-amount">—</td></tr>');
      rows.push('<tr class="journal-row journal-credit"><td><span class="journal-account"><span class="journal-account-dot credit"></span>Kas / Bank</span></td><td class="journal-amount">—</td><td class="journal-amount credit-amount">' + RFUtil.money(payment.paid_amount) + '</td></tr>');
    });
    var monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date());
    container.innerHTML = head("Jurnal Transaksi", "Jurnal informatif yang diturunkan dari pembayaran yang telah dicatat.") +
      '<section class="journal-hero">' +
        '<div class="journal-hero-pattern" aria-hidden="true"></div>' +
        '<div class="journal-hero-main"><div class="journal-eyebrow"><span class="journal-eyebrow-icon">' + RFUtil.icon("chart") + '</span> REKONSILIASI JURNAL</div>' +
          '<h2>Setiap transaksi<br><span>balance.</span></h2>' +
          '<div class="journal-balance-pill"><span class="journal-live-dot"></span>' + RFUtil.icon("chart") + ' Balance <span class="journal-balance-divider"></span> Selisih ' + RFUtil.money(0) + '</div>' +
        '</div>' +
        '<div class="journal-hero-summary">' +
          '<div class="journal-summary-top"><div><span class="journal-summary-label">TOTAL JURNAL TERCATAT</span><strong>' + RFUtil.money(totalDebit) + '</strong></div><span class="journal-summary-icon">' + RFUtil.icon("receipt") + '</span></div>' +
          '<div class="journal-balance-track"><span></span><i></i><span></span></div>' +
          '<div class="journal-flow-labels"><span><i class="debit"></i> Debit <strong>' + RFUtil.money(totalDebit) + '</strong></span><span><i class="credit"></i> Kredit <strong>' + RFUtil.money(totalDebit) + '</strong></span></div>' +
          '<div class="journal-summary-footer"><span>' + RFUtil.icon("card") + " " + result.length + ' pembayaran tercatat</span><span>' + RFUtil.icon("clock") + " " + RFUtil.escape(monthLabel) + '</span></div>' +
        '</div>' +
      '</section>' +
      '<div class="journal-note"><span class="journal-note-icon">' + RFUtil.icon("receipt") + '</span><p><strong>Bagaimana jurnal ini bekerja?</strong> Setiap pembayaran menghasilkan debit Beban Reimbursement dan kredit Kas / Bank dengan nilai yang sama. Jurnal ini adalah tampilan turunan dari pembayaran, bukan buku besar resmi.</p></div>' +
      simpleTable("Buku Jurnal", result.length + " transaksi · setiap pembayaran dicatat dalam pasangan debit dan kredit.", ["TANGGAL", "NO. PENGAJUAN / REFERENSI", "KARYAWAN", "KATEGORI", "AKUN", "DEBIT", "KREDIT"], rows, "Jurnal akan muncul setelah pembayaran dicatat.");
  }
  window.RFViews = window.RFViews || {};
  window.RFViews.departments = departments;
  window.RFViews.employees = employees;
  window.RFViews.categories = categories;
  window.RFViews.profile = profile;
  window.RFViews.activity = activity;
  window.RFViews.journal = journal;
})();
