(function () {
  var reportRows = [];
  function fail(result) { if (result.error) throw result.error; return result.data || []; }
  function reportHeading() {
    return '<div class="page-heading"><div><p class="eyebrow">REIMFLOW WORKSPACE</p><h1>Laporan Reimbursement</h1><p>Analisis pengajuan berdasarkan periode, departemen, dan kategori.</p></div><div class="filter-row no-print"><button class="button button-secondary" id="export-report">' + RFUtil.icon("download") + " Ekspor CSV</button><button class=\"button button-primary\" id=\"print-report\">Cetak Laporan</button></div></div>";
  }
  function reportStat(label, value, icon, caption) {
    return '<article class="stat-card"><div class="stat-top"><span>' + label + '</span><span class="stat-icon">' + RFUtil.icon(icon) + '</span></div><strong>' + value + '</strong><small>' + caption + "</small></article>";
  }
  function breakdown(rows, key, title) {
    var totals = {};
    rows.forEach(function (row) {
      var label = key === "department" ? row.profiles && row.profiles.departments && row.profiles.departments.department_name || "Tidak ditentukan" : row.category || "Tidak ditentukan";
      if (!totals[label]) totals[label] = { count: 0, amount: 0 };
      totals[label].count++;
      totals[label].amount += Number(row.amount);
    });
    var tr = Object.keys(totals).sort(function (a, b) { return totals[b].amount - totals[a].amount; }).map(function (label) {
      return "<tr><td><strong>" + RFUtil.escape(label) + "</strong></td><td>" + totals[label].count + "</td><td>" + RFUtil.money(totals[label].amount) + "</td></tr>";
    });
    return '<section class="panel"><div class="panel-header"><div><h2>' + title + '</h2><p>Menurut nominal pengajuan dalam periode terpilih.</p></div></div><div class="table-wrap"><table><thead><tr><th>' + (key === "department" ? "DEPARTEMEN" : "KATEGORI") + "</th><th>JUMLAH</th><th>TOTAL NOMINAL</th></tr></thead><tbody>" + (tr.length ? tr.join("") : '<tr><td colspan="3"><div class="empty-state">Tidak ada data.</div></td></tr>') + "</tbody></table></div></section>";
  }
  async function render(container) {
    var result = await RF.sb.from("reimbursements").select("id, request_number, transaction_date, category, amount, status, profiles!reimbursements_employee_id_fkey(full_name, departments(department_name))").order("transaction_date", { ascending: false });
    if (result.error) throw result.error;
    reportRows = result.data || [];
    var today = new Date();
    var start = RFUtil.dateInput(new Date(today.getFullYear(), today.getMonth(), 1));
    container.innerHTML = reportHeading() +
      '<section class="panel" style="margin-bottom:16px"><div class="toolbar"><label class="field-label">Dari tanggal<input id="report-from" type="date" value="' + start + '"></label><label class="field-label">Sampai tanggal<input id="report-to" type="date" value="' + RFUtil.dateInput(today) + '"></label><select id="report-department"><option value="">Semua departemen</option></select><select id="report-category"><option value="">Semua kategori</option>' + window.REIMFLOW_CATEGORIES.map(function (item) { return '<option>' + RFUtil.escape(item) + "</option>"; }).join("") + '</select><button id="apply-report" class="button button-secondary button-small">Terapkan Filter</button></div></section>' +
      '<div id="report-output"></div>';
    var departments = Array.from(new Set(reportRows.map(function (row) { return row.profiles && row.profiles.departments && row.profiles.departments.department_name; }).filter(Boolean))).sort();
    document.getElementById("report-department").innerHTML += departments.map(function (item) { return '<option>' + RFUtil.escape(item) + "</option>"; }).join("");
    function update() {
      var from = document.getElementById("report-from").value;
      var to = document.getElementById("report-to").value;
      var dept = document.getElementById("report-department").value;
      var category = document.getElementById("report-category").value;
      if (from && to && from > to) { RFUtil.toast("Rentang tanggal tidak valid.", "error"); return; }
      var rows = reportRows.filter(function (row) {
        return (!from || row.transaction_date >= from) && (!to || row.transaction_date <= to) &&
          (!dept || row.profiles && row.profiles.departments && row.profiles.departments.department_name === dept) &&
          (!category || row.category === category);
      });
      var statuses = { total: rows.length, approved: 0, rejected: 0, paid: 0, pending: 0 };
      var totalAmount = 0;
      var paidAmount = 0;
      rows.forEach(function (row) {
        totalAmount += Number(row.amount);
        if (row.status === "Disetujui") statuses.approved++;
        if (row.status === "Ditolak") statuses.rejected++;
        if (row.status === "Dibayarkan") { statuses.paid++; paidAmount += Number(row.amount); }
        if (row.status === "Menunggu Persetujuan") statuses.pending++;
      });
      var tableRows = rows.map(function (row) {
        return "<tr><td><strong>" + RFUtil.escape(row.request_number) + "</strong></td><td>" + RFUtil.escape(row.profiles.full_name) + "</td><td>" + RFUtil.escape(row.profiles.departments && row.profiles.departments.department_name || "—") + "</td><td>" + RFUtil.date(row.transaction_date) + "</td><td>" + RFUtil.escape(row.category) + "</td><td>" + RFUtil.money(row.amount) + "</td><td>" + RFUtil.status(row.status) + "</td></tr>";
      });
      document.getElementById("report-output").innerHTML =
        '<div class="stats-grid">' + reportStat("Total Pengajuan", statuses.total, "receipt", "Semua status") + reportStat("Disetujui", statuses.approved, "chart", "Belum termasuk status dibayarkan") + reportStat("Ditolak", statuses.rejected, "users", "Dalam periode") + reportStat("Dibayarkan", statuses.paid, "card", RFUtil.money(paidAmount) + " total pembayaran") + "</div>" +
        '<div class="dashboard-grid"><div>' + breakdown(rows, "department", "Berdasarkan Departemen") + '</div><div>' + breakdown(rows, "category", "Berdasarkan Kategori") + '</div></div><div style="height:16px"></div>' +
        '<section class="panel"><div class="panel-header"><div><h2>Rincian Laporan</h2><p>' + RFUtil.date(from) + " — " + RFUtil.date(to) + ' · ' + rows.length + " pengajuan · nilai pengajuan " + RFUtil.money(totalAmount) + '</p></div></div><div class="table-wrap"><table><thead><tr><th>NO. PENGAJUAN</th><th>KARYAWAN</th><th>DEPARTEMEN</th><th>TANGGAL</th><th>KATEGORI</th><th>NOMINAL</th><th>STATUS</th></tr></thead><tbody>' + (tableRows.length ? tableRows.join("") : '<tr><td colspan="7"><div class="empty-state">Tidak ada pengajuan pada filter ini.</div></td></tr>') + "</tbody></table></div></section>";
      container.dataset.reportRows = JSON.stringify(rows);
    }
    document.getElementById("apply-report").onclick = update;
    document.getElementById("export-report").onclick = function () {
      var rows = JSON.parse(container.dataset.reportRows || "[]");
      var data = [["Nomor Pengajuan", "Karyawan", "Departemen", "Tanggal", "Kategori", "Nominal", "Status"]].concat(rows.map(function (row) {
        return [row.request_number, row.profiles.full_name, row.profiles.departments && row.profiles.departments.department_name || "", row.transaction_date, row.category, row.amount, row.status];
      }));
      var csv = "\uFEFF" + data.map(function (line) {
        return line.map(function (cell) {
          var value = String(cell == null ? "" : cell);
          if (/^\s*[=+\-@\t\r]/.test(value)) value = "'" + value;
          return '"' + value.replace(/"/g, '""') + '"';
        }).join(",");
      }).join("\r\n");
      var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      var link = document.createElement("a");
      link.href = url;
      link.download = "reimflow-laporan-" + RFUtil.dateInput() + ".csv";
      link.click();
      URL.revokeObjectURL(url);
    };
    document.getElementById("print-report").onclick = function () { window.print(); };
    update();
  }
  window.RFViews = window.RFViews || {};
  window.RFViews.reports = render;
})();
