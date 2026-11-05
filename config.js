/* Replace these values with the public URL and publishable/anon key from Supabase. */
window.REIMFLOW_CONFIG = {
  supabaseUrl: "https://rpxavektjrmnxmzetpzo.supabase.co",
  supabasePublishableKey: "sb_publishable_9A7Zg8sXDAT0IY08ljECDA_74i8mrUf"
};

window.REIMFLOW_CATEGORIES = [
  "Transportasi",
  "Konsumsi",
  "Perlengkapan Kantor",
  "Akomodasi",
  "Komunikasi dan Internet",
  "Keperluan Proyek",
  "Lainnya"
];

window.RFUtil = {
  escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  },
  money(value) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
  },
  date(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value + (String(value).length === 10 ? "T00:00:00" : "")));
  },
  dateTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  },
  dateInput(value) {
    var date = value || new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  },
  initials(name) {
    return String(name || "RF").trim().split(/\s+/).slice(0, 2).map(function (part) { return part[0] || ""; }).join("").toUpperCase();
  },
  status(value) {
    var classes = { "Menunggu Persetujuan": "pending", "Disetujui": "approved", "Ditolak": "rejected", "Dibayarkan": "paid" };
    return '<span class="badge badge-' + (classes[value] || "neutral") + '"><i></i>' + this.escape(value || "—") + "</span>";
  },
  icon(name) {
    var paths = {
      dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
      receipt: '<path d="M4 3h16v18l-3-2-3 2-3-2-3 2-4-2V3Z"/><path d="M8 8h8M8 12h6"/>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      building: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 8h2m4 0h2M8 12h2m4 0h2M10 21v-4h4v4"/>',
      tag: '<path d="M20.6 13.4 11 3.8A2 2 0 0 0 9.6 3H4a1 1 0 0 0-1 1v5.6a2 2 0 0 0 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.8Z"/><circle cx="7.5" cy="7.5" r="1"/>',
      card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
      chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
      logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
      menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
      close: '<path d="m18 6-12 12M6 6l12 12"/>',
      arrow: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
      file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.dashboard) + "</svg>";
  },
  toast(message, type) {
    var region = document.getElementById("toast-region");
    var toast = document.createElement("div");
    toast.className = "toast toast-" + (type || "success");
    toast.innerHTML = '<span class="toast-mark">' + (type === "error" ? "!" : "✓") + "</span><span>" + this.escape(message) + "</span>";
    region.appendChild(toast);
    window.setTimeout(function () { toast.classList.add("toast-out"); window.setTimeout(function () { toast.remove(); }, 250); }, 3800);
  }
};
