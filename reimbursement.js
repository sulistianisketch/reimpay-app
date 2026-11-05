(function () {
  var H = window.RFDashboardHelpers;
  var bucket = "receipts";
  var selectedFile = null;
  var objectUrl = null;

  function fail(result) {
    if (result.error) throw result.error;
    return result.data;
  }
  function panelTable(title, subtitle, headers, rows, empty) {
    return '<section class="panel"><div class="panel-header"><div><h2>' + title + '</h2><p>' + subtitle + '</p></div></div><div class="table-wrap"><table><thead><tr>' + headers.map(function (head) { return "<th>" + head + "</th>"; }).join("") + "</tr></thead><tbody>" + (rows || '<tr><td colspan="9"><div class="empty-state"><strong>Belum ada data</strong>' + empty + "</div></td></tr>") + "</tbody></table></div></section>";
  }
  function heading(title, subtitle) { return H.pageHeading(title, subtitle); }
  function detailButtons(row, isAdmin) {
    return '<button class="table-link" data-detail="' + row.id + '" data-admin="' + isAdmin + '">Detail</button>';
  }
  function renderRows(rows, showEmployee, isAdmin) {
    return rows.map(function (row) {
      return "<tr><td><strong>" + RFUtil.escape(row.request_number) + "</strong></td>" +
        (showEmployee ? "<td>" + RFUtil.escape(row.profiles && row.profiles.full_name || "—") + "</td>" : "") +
        "<td>" + RFUtil.date(row.transaction_date) + "</td><td>" + RFUtil.escape(row.category) + "</td><td><strong>" + RFUtil.money(row.amount) + "</strong></td><td>" + RFUtil.status(row.status) + "</td><td>" + detailButtons(row, isAdmin) + "</td></tr>";
    }).join("");
  }
  function bindDetails(container, isAdmin) {
    container.querySelectorAll("[data-detail]").forEach(function (button) {
      button.onclick = function () { showReimbursement(button.dataset.detail, isAdmin); };
    });
  }
  function bindFilters(container, rows, showEmployee, isAdmin) {
    var search = container.querySelector("[data-reimbursement-search]");
    var status = container.querySelector("[data-reimbursement-status]");
    var category = container.querySelector("[data-reimbursement-category]");
    var department = container.querySelector("[data-reimbursement-department]");
    var from = container.querySelector("[data-reimbursement-from]");
    var to = container.querySelector("[data-reimbursement-to]");
    function apply() {
      if (from && to && from.value && to.value && from.value > to.value) {
        RFUtil.toast("Rentang tanggal tidak valid.", "error");
        return;
      }
      var term = (search.value || "").toLowerCase();
      var filtered = rows.filter(function (row) {
        var matchesSearch = [row.request_number, row.category, row.description, row.profiles && row.profiles.full_name].join(" ").toLowerCase().includes(term);
        var matchesStatus = !status.value || row.status === status.value;
        var matchesCategory = !category || !category.value || row.category === category.value;
        var matchesDepartment = !department || !department.value || row.profiles && row.profiles.departments && row.profiles.departments.department_name === department.value;
        var matchesDate = (!from || !from.value || row.transaction_date >= from.value) && (!to || !to.value || row.transaction_date <= to.value);
        return matchesSearch && matchesStatus && matchesCategory && matchesDepartment && matchesDate;
      });
      var body = container.querySelector("tbody");
      body.innerHTML = filtered.length ? renderRows(filtered, showEmployee, isAdmin) : '<tr><td colspan="8"><div class="empty-state"><strong>Tidak ada hasil</strong>Coba ubah kata kunci atau filter.</div></td></tr>';
      bindDetails(container, isAdmin);
    }
    search.addEventListener("input", apply);
    status.addEventListener("change", apply);
    if (category) category.addEventListener("change", apply);
    if (department) department.addEventListener("change", apply);
    if (from) from.addEventListener("change", apply);
    if (to) to.addEventListener("change", apply);
  }
  function filterMarkup(rows, isAdmin) {
    var departments = Array.from(new Set(rows.map(function (r) { return r.profiles && r.profiles.departments && r.profiles.departments.department_name; }).filter(Boolean)));
    var categories = Array.from(new Set(rows.map(function (r) { return r.category; })));
    return '<div class="toolbar"><label class="search-box">' + RFUtil.icon("search") + '<input data-reimbursement-search type="search" placeholder="Cari nomor, karyawan, kategori..."></label><select data-reimbursement-status><option value="">Semua status</option><option>Menunggu Persetujuan</option><option>Disetujui</option><option>Ditolak</option><option>Dibayarkan</option></select><input data-reimbursement-from type="date" aria-label="Tanggal transaksi dari"><input data-reimbursement-to type="date" aria-label="Tanggal transaksi sampai">' +
      (isAdmin ? '<select data-reimbursement-department><option value="">Semua departemen</option>' + departments.map(function (d) { return '<option value="' + RFUtil.escape(d) + '">' + RFUtil.escape(d) + "</option>"; }).join("") + "</select>" : "") +
      '<select data-reimbursement-category><option value="">Semua kategori</option>' + categories.map(function (c) { return '<option value="' + RFUtil.escape(c) + '">' + RFUtil.escape(c) + "</option>"; }).join("") + "</select></div>";
  }
  async function loadRows(isAdmin) {
    var query = RF.sb.from("reimbursements").select("id, request_number, employee_id, transaction_date, category, amount, description, receipt_path, status, rejection_reason, reviewed_by, reviewed_at, created_at" +
      (isAdmin ? ", profiles!reimbursements_employee_id_fkey(full_name, email, departments(department_name))" : ""));
    if (!isAdmin) query = query.eq("employee_id", RF.user.id);
    return fail(await query.order("transaction_date", { ascending: false }).order("created_at", { ascending: false }));
  }
  async function newReimbursement(container) {
    selectedFile = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    var categories = window.REIMFLOW_CATEGORIES;
    container.innerHTML = heading("Ajukan Reimbursement", "Isi detail transaksi dan unggah bukti pengeluaran.") +
      '<section class="panel"><div class="panel-header"><div><h2>Informasi Transaksi</h2><p>Pastikan data sesuai dengan bukti transaksi.</p></div><span class="badge badge-neutral">Semua kolom wajib diisi</span></div><div class="panel-body"><form id="reimbursement-form" novalidate><div class="form-grid">' +
      '<label class="field-label">Tanggal transaksi<input name="transaction_date" type="date" max="' + RFUtil.dateInput() + '" required></label>' +
      '<label class="field-label">Kategori pengeluaran<select name="category" required><option value="">Pilih kategori</option>' + categories.map(function (item) { return '<option>' + RFUtil.escape(item) + "</option>"; }).join("") + "</select></label>" +
      '<label class="field-label">Nominal reimbursement (IDR)<input name="amount" type="number" min="1" step="1" placeholder="Contoh: 150000" required><span class="field-hint">Masukkan nominal lebih besar dari 0.</span></label>' +
      '<label class="field-label">Deskripsi / tujuan pengeluaran<textarea name="description" maxlength="1000" placeholder="Ceritakan keperluan transaksi..." required></textarea></label>' +
      '<div class="field-label span-two">Bukti transaksi <span class="field-hint">Wajib · JPG, JPEG, PNG, atau PDF · Maksimal 5 MB</span><label class="upload-zone" id="upload-zone" for="receipt-file">' + RFUtil.icon("download") + '<strong>Pilih atau letakkan file di sini</strong><small>Pastikan bukti transaksi terlihat jelas</small></label><input id="receipt-file" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" hidden required><div id="upload-preview"></div></div>' +
      '</div><div class="note" style="margin-top:18px">Setelah pengajuan dikirim, data tidak dapat diubah. Pastikan tanggal, nominal, deskripsi, dan bukti transaksi sudah benar.</div><div class="form-actions"><button type="button" class="button button-secondary" data-cancel>Batalkan</button><button type="submit" class="button button-primary">Kirim Pengajuan ' + RFUtil.icon("arrow") + "</button></div><p id=\"submit-error\" class=\"form-error\"></p></form></div></section>";
    var form = document.getElementById("reimbursement-form");
    var input = document.getElementById("receipt-file");
    var zone = document.getElementById("upload-zone");
    var preview = document.getElementById("upload-preview");
    function setFile(file) {
      var allowed = ["image/jpeg", "image/png", "application/pdf"];
      var extension = file && file.name.split(".").pop().toLowerCase();
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { RFUtil.toast("Ukuran file maksimal 5 MB.", "error"); input.value = ""; return; }
      if (allowed.indexOf(file.type) === -1 || ["jpg", "jpeg", "png", "pdf"].indexOf(extension) === -1) { RFUtil.toast("Format file harus JPG, JPEG, PNG, atau PDF.", "error"); input.value = ""; return; }
      selectedFile = file;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = file.type.indexOf("image/") === 0 ? URL.createObjectURL(file) : null;
      preview.innerHTML = '<div class="upload-preview">' + (objectUrl ? '<img src="' + objectUrl + '" alt="Preview bukti transaksi">' : '<span class="stat-icon">' + RFUtil.icon("file") + "</span>") + "<span>" + RFUtil.escape(file.name) + " · " + (file.size / 1024 / 1024).toFixed(2) + ' MB</span><button type="button" data-remove-file>Hapus</button></div>';
      preview.querySelector("[data-remove-file]").onclick = function () { selectedFile = null; input.value = ""; preview.innerHTML = ""; if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; };
    }
    input.addEventListener("change", function () { setFile(input.files[0]); });
    zone.addEventListener("dragover", function (event) { event.preventDefault(); zone.classList.add("dragover"); });
    zone.addEventListener("dragleave", function () { zone.classList.remove("dragover"); });
    zone.addEventListener("drop", function (event) { event.preventDefault(); zone.classList.remove("dragover"); setFile(event.dataTransfer.files[0]); });
    form.querySelector("[data-cancel]").onclick = function () { RFApp.go("dashboard"); };
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var error = document.getElementById("submit-error");
      error.textContent = "";
      var values = new FormData(form);
      var amount = Number(values.get("amount"));
      var date = values.get("transaction_date");
      if (!date || date > RFUtil.dateInput()) { error.textContent = "Tanggal transaksi tidak boleh kosong atau di masa depan."; return; }
      if (!values.get("category")) { error.textContent = "Pilih kategori pengeluaran."; return; }
      if (!Number.isFinite(amount) || amount <= 0) { error.textContent = "Nominal harus lebih besar dari 0."; return; }
      if (!String(values.get("description") || "").trim()) { error.textContent = "Deskripsi atau tujuan pengeluaran wajib diisi."; return; }
      if (!selectedFile) { error.textContent = "Unggah bukti transaksi sebelum mengirim pengajuan."; return; }
      var button = form.querySelector('[type="submit"]');
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span>Mengirim...';
      var fileId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      var path = RF.user.id + "/" + fileId + "-" + selectedFile.name.replace(/[^\w.-]/g, "_");
      var uploaded = false;
      try {
        var upload = await RF.sb.storage.from(bucket).upload(path, selectedFile, { contentType: selectedFile.type, upsert: false });
        if (upload.error) throw upload.error;
        uploaded = true;
        var result = await RF.sb.from("reimbursements").insert({
          employee_id: RF.user.id,
          transaction_date: date,
          category: values.get("category"),
          amount: amount,
          description: String(values.get("description")).trim(),
          receipt_path: path
        }).select("id").single();
        if (result.error) throw result.error;
        RFUtil.toast("Pengajuan berhasil dikirim dan menunggu persetujuan.");
        await RFApp.go("history");
      } catch (reason) {
        if (uploaded) {
          var cleanup = await RF.sb.storage.from(bucket).remove([path]);
          if (cleanup.error) error.textContent = reason.message + " (Bukti terunggah, tetapi pembersihan file gagal: " + cleanup.error.message + ")";
          else error.textContent = reason.message;
        } else error.textContent = reason.message;
      } finally {
        button.disabled = false;
        button.innerHTML = "Kirim Pengajuan " + RFUtil.icon("arrow");
      }
    });
  }
  async function signedReceipt(path) {
    if (!path) return null;
    var result = await RF.sb.storage.from(bucket).createSignedUrl(path, 300);
    if (result.error) throw result.error;
    return result.data.signedUrl;
  }
  function modal(title, content) {
    var dialog = document.getElementById("app-modal");
    dialog.innerHTML = '<div class="modal-head"><h2>' + title + '</h2><button class="icon-button" data-modal-close aria-label="Tutup">' + RFUtil.icon("close") + '</button></div><div class="modal-body">' + content + "</div>";
    dialog.querySelector("[data-modal-close]").onclick = function () { dialog.close(); };
    dialog.showModal();
  }
  async function showReimbursement(id, isAdmin) {
    try {
      var query = RF.sb.from("reimbursements").select("id, request_number, employee_id, transaction_date, category, amount, description, receipt_path, status, rejection_reason, reviewed_at, created_at" +
        (isAdmin ? ", profiles!reimbursements_employee_id_fkey(full_name, email, departments(department_name))" : ""));
      var result = await query.eq("id", id).single();
      if (result.error) throw result.error;
      var row = result.data;
      var url = await signedReceipt(row.receipt_path);
      var receipt = url ? (row.receipt_path.toLowerCase().endsWith(".pdf")
        ? '<iframe class="receipt-frame" src="' + url + '" title="Bukti transaksi PDF"></iframe>'
        : '<a href="' + url + '" target="_blank" rel="noopener"><img class="receipt-preview" src="' + url + '" alt="Bukti transaksi"></a>') : '<p class="note">Bukti transaksi tidak tersedia.</p>';
      var details = '<div class="detail-grid">' +
        '<div class="detail-item"><small>Nomor pengajuan</small><strong>' + RFUtil.escape(row.request_number) + "</strong></div>" +
        (isAdmin ? '<div class="detail-item"><small>Karyawan</small><strong>' + RFUtil.escape(row.profiles.full_name) + " · " + RFUtil.escape(row.profiles.departments && row.profiles.departments.department_name || "—") + "</strong></div>" : "") +
        '<div class="detail-item"><small>Tanggal transaksi</small><strong>' + RFUtil.date(row.transaction_date) + "</strong></div>" +
        '<div class="detail-item"><small>Kategori</small><strong>' + RFUtil.escape(row.category) + "</strong></div>" +
        '<div class="detail-item"><small>Nominal</small><strong>' + RFUtil.money(row.amount) + "</strong></div>" +
        '<div class="detail-item"><small>Status</small>' + RFUtil.status(row.status) + "</div>" +
        '<div class="detail-item"><small>Tanggal pengajuan</small><strong>' + RFUtil.dateTime(row.created_at) + "</strong></div>" +
        '<div class="detail-item"><small>Deskripsi</small><strong>' + RFUtil.escape(row.description) + "</strong></div></div>" +
        (row.rejection_reason ? '<div class="note" style="margin-top:16px"><strong>Alasan penolakan:</strong> ' + RFUtil.escape(row.rejection_reason) + "</div>" : "") +
        '<h3 class="panel-title" style="margin-top:20px">Bukti transaksi</h3>' + receipt;
      var actions = "";
      if (isAdmin && row.status === "Menunggu Persetujuan") {
        actions = '<div class="modal-actions"><button class="button button-danger" data-review="reject">Tolak Pengajuan</button><button class="button button-primary" data-review="approve">Setujui Pengajuan</button></div>';
      } else if (isAdmin && row.status === "Disetujui") {
        actions = '<div class="modal-actions"><button class="button button-primary" data-open-payment="true">Catat Pembayaran</button></div>';
      }
      modal("Detail " + RFUtil.escape(row.request_number), details + actions);
      var dialog = document.getElementById("app-modal");
      dialog.querySelectorAll("[data-review]").forEach(function (button) {
        button.onclick = async function () {
          if (button.dataset.review === "reject") {
            button.closest(".modal-actions").outerHTML = '<div class="form-stack" style="margin-top:18px"><label>Alasan penolakan wajib diisi<textarea id="rejection-reason" maxlength="1000" placeholder="Jelaskan alasan pengajuan ditolak..."></textarea></label><div class="modal-actions"><button class="button button-secondary" data-review-cancel>Batal</button><button class="button button-danger" data-submit-rejection>Konfirmasi Penolakan</button></div></div>';
            dialog.querySelector("[data-review-cancel]").onclick = function () { dialog.close(); RFApp.go("reimbursements"); };
            dialog.querySelector("[data-submit-rejection]").onclick = function () { submitReview(id, "reject", dialog.querySelector("#rejection-reason").value); };
          } else await submitReview(id, "approve", "");
        };
      });
      var paymentButton = dialog.querySelector("[data-open-payment]");
      if (paymentButton) paymentButton.onclick = function () { dialog.close(); RFViews.openPaymentForm(row); };
    } catch (error) {
      RFUtil.toast("Detail tidak dapat dibuka: " + error.message, "error");
    }
  }
  async function submitReview(id, decision, reason) {
    if (decision === "reject" && !String(reason).trim()) { RFUtil.toast("Alasan penolakan wajib diisi.", "error"); return; }
    var result = await RF.sb.rpc("review_reimbursement", {
      p_reimbursement_id: id,
      p_decision: decision,
      p_rejection_reason: decision === "reject" ? String(reason).trim() : null
    });
    if (result.error) { RFUtil.toast("Perubahan status gagal: " + result.error.message, "error"); return; }
    document.getElementById("app-modal").close();
    RFUtil.toast(decision === "approve" ? "Pengajuan berhasil disetujui." : "Pengajuan berhasil ditolak.");
    await RFApp.go("reimbursements");
  }
  async function reimbursementList(container) {
    var rows = await loadRows(true);
    var headingHtml = heading("Pengajuan Reimbursement", "Periksa pengajuan dan bukti transaksi karyawan.");
    var html = headingHtml + filterMarkup(rows, true) + '<section class="panel"><div class="table-wrap"><table><thead><tr><th>NO. PENGAJUAN</th><th>KARYAWAN</th><th>TANGGAL</th><th>KATEGORI</th><th>NOMINAL</th><th>STATUS</th><th></th></tr></thead><tbody>' + (rows.length ? renderRows(rows, true, true) : '<tr><td colspan="7"><div class="empty-state"><strong>Belum ada pengajuan</strong>Pengajuan karyawan akan tampil di sini.</div></td></tr>') + "</tbody></table></div></section>";
    container.innerHTML = html;
    bindFilters(container, rows, true, true);
    bindDetails(container, true);
  }
  async function employeeHistory(container) {
    var rows = await loadRows(false);
    container.innerHTML = heading("Riwayat Pengajuan", "Seluruh pengajuan reimbursement yang Anda kirim.") + filterMarkup(rows, false) + '<section class="panel"><div class="table-wrap"><table><thead><tr><th>NO. PENGAJUAN</th><th>TANGGAL</th><th>KATEGORI</th><th>NOMINAL</th><th>STATUS</th><th></th></tr></thead><tbody>' + (rows.length ? renderRows(rows, false, false) : '<tr><td colspan="6"><div class="empty-state"><strong>Belum ada pengajuan</strong>Pengajuan yang Anda buat akan muncul di sini.</div></td></tr>') + "</tbody></table></div></section>";
    bindFilters(container, rows, false, false);
    bindDetails(container, false);
  }
  async function paymentList(container) {
    var result = await RF.sb.from("reimbursements").select("id, request_number, employee_id, transaction_date, category, amount, status, profiles!reimbursements_employee_id_fkey(full_name)").eq("status", "Disetujui").order("reviewed_at", { ascending: true });
    if (result.error) throw result.error;
    var rows = result.data || [];
    var tr = rows.map(function (row) {
      return "<tr><td><strong>" + RFUtil.escape(row.request_number) + "</strong></td><td>" + RFUtil.escape(row.profiles.full_name) + "</td><td>" + RFUtil.date(row.transaction_date) + "</td><td>" + RFUtil.escape(row.category) + "</td><td><strong>" + RFUtil.money(row.amount) + "</strong></td><td><button class=\"button button-small button-primary\" data-pay=\"" + row.id + '">Catat Pembayaran</button></td></tr>';
    }).join("");
    var payments = await RF.sb.from("payments").select("id, reimbursement_id, paid_by, payment_date, paid_amount, payment_reference, created_at, reimbursements(request_number, profiles!reimbursements_employee_id_fkey(full_name)), profiles!payments_paid_by_fkey(full_name)").order("payment_date", { ascending: false });
    if (payments.error) throw payments.error;
    var history = (payments.data || []).map(function (row) {
      return "<tr><td><strong>" + RFUtil.escape(row.reimbursements.request_number) + "</strong></td><td>" + RFUtil.escape(row.reimbursements.profiles.full_name) + "</td><td>" + RFUtil.date(row.payment_date) + "</td><td>" + RFUtil.money(row.paid_amount) + "</td><td>" + RFUtil.escape(row.payment_reference) + "</td><td>" + RFUtil.escape(row.profiles.full_name) + "</td></tr>";
    }).join("");
    container.innerHTML = heading("Pembayaran", "Kelola pengajuan disetujui dan tinjau riwayat pembayaran.") +
      panelTable("Siap Dibayarkan", rows.length + " pengajuan disetujui belum dibayarkan.", ["NO. PENGAJUAN", "KARYAWAN", "TANGGAL", "KATEGORI", "NOMINAL", "AKSI"], tr, "Belum ada pengajuan yang siap dibayarkan.") +
      '<div style="height:16px"></div>' +
      panelTable("Riwayat Pembayaran", (payments.data || []).length + " pembayaran telah dicatat.", ["NO. PENGAJUAN", "KARYAWAN", "TANGGAL", "NOMINAL", "REFERENSI", "DICATAT OLEH"], history, "Pembayaran yang sudah dicatat akan muncul di sini.");
    container.querySelectorAll("[data-pay]").forEach(function (button) {
      button.onclick = async function () {
        var row = rows.find(function (item) { return item.id === button.dataset.pay; });
        openPaymentForm(row);
      };
    });
  }
  function openPaymentForm(row) {
    var html = '<div class="note">Pembayaran penuh untuk <strong>' + RFUtil.escape(row.request_number) + '</strong> · ' + RFUtil.money(row.amount) + "</div>" +
      '<form id="payment-form" class="form-stack" style="margin-top:16px"><label>Tanggal pembayaran<input name="payment_date" type="date" max="' + RFUtil.dateInput() + '" value="' + RFUtil.dateInput() + '" required></label><label>Nominal dibayarkan<input name="paid_amount" type="number" min="1" step="1" value="' + Number(row.amount) + '" required></label><label>Referensi pembayaran<input name="payment_reference" maxlength="150" placeholder="Contoh: TRF-2026-001" required></label><div class="modal-actions"><button type="button" class="button button-secondary" data-modal-close>Batal</button><button type="submit" class="button button-primary">Simpan Pembayaran</button></div><p id="payment-error" class="form-error"></p></form>';
    modal("Catat Pembayaran", html);
    var dialog = document.getElementById("app-modal");
    dialog.querySelector("[data-modal-close]").onclick = function () { dialog.close(); };
    dialog.querySelector("#payment-form").onsubmit = async function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var values = new FormData(form);
      var paid = Number(values.get("paid_amount"));
      var date = values.get("payment_date");
      var reference = String(values.get("payment_reference")).trim();
      var error = dialog.querySelector("#payment-error");
      if (paid !== Number(row.amount)) { error.textContent = "Nominal pembayaran harus sama dengan nominal pengajuan yang disetujui."; return; }
      if (!reference || !date) { error.textContent = "Tanggal dan referensi pembayaran wajib diisi."; return; }
      var button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        var result = await RF.sb.rpc("record_reimbursement_payment", {
          p_reimbursement_id: row.id,
          p_payment_date: date,
          p_paid_amount: paid,
          p_payment_reference: reference
        });
        if (result.error) throw result.error;
        dialog.close();
        RFUtil.toast("Pembayaran berhasil dicatat.");
        await RFApp.go("payments");
      } catch (reason) {
        error.textContent = reason.message;
        button.disabled = false;
      }
    };
  }
  async function showPayments(container) {
    var result = await RF.sb.from("payments").select("id, reimbursement_id, paid_by, payment_date, paid_amount, payment_reference, created_at, reimbursements(request_number, category, employee_id, profiles!reimbursements_employee_id_fkey(full_name)), profiles!payments_paid_by_fkey(full_name)").order("payment_date", { ascending: false });
    if (result.error) throw result.error;
    var rows = result.data || [];
    var tr = rows.map(function (row) {
      return "<tr><td><strong>" + RFUtil.escape(row.reimbursements.request_number) + "</strong></td><td>" + RFUtil.escape(row.reimbursements.profiles.full_name) + "</td><td>" + RFUtil.date(row.payment_date) + "</td><td>" + RFUtil.money(row.paid_amount) + "</td><td>" + RFUtil.escape(row.payment_reference) + "</td><td>" + RFUtil.escape(row.profiles.full_name) + "</td></tr>";
    }).join("");
    container.innerHTML = heading("Riwayat Pembayaran", "Pembayaran reimbursement yang telah dicatat.") +
      panelTable("Semua Pembayaran", rows.length + " transaksi pembayaran.", ["NO. PENGAJUAN", "KARYAWAN", "TANGGAL", "NOMINAL", "REFERENSI", "DICATAT OLEH"], tr, "Pembayaran yang sudah dicatat akan muncul di sini.");
  }
  window.RFViews = window.RFViews || {};
  window.RFViews.new = newReimbursement;
  window.RFViews.history = employeeHistory;
  window.RFViews.reimbursements = reimbursementList;
  window.RFViews.payments = paymentList;
  window.RFViews.paymentHistory = showPayments;
  window.RFViews.showReimbursement = showReimbursement;
  window.RFViews.openPaymentForm = openPaymentForm;
})();
