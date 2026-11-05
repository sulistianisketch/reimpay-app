"use strict";

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error("SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const publicClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || "null,http://localhost:5500,http://127.0.0.1:5500")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed."));
  }
}));
app.use(express.json({ limit: "32kb" }));

const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function responseError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function authenticate(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return responseError(res, 401, "Sesi autentikasi diperlukan.");

  const { data, error } = await publicClient.auth.getUser(match[1]);
  if (error || !data.user) return responseError(res, 401, "Sesi tidak valid atau telah kedaluwarsa.");
  req.user = data.user;
  return next();
}

async function requireAdmin(req, res, next) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("role, is_active")
    .eq("id", req.user.id)
    .single();
  if (error || !data.is_active) return responseError(res, 403, "Profil pengguna tidak aktif atau tidak ditemukan.");
  if (data.role !== "admin") return responseError(res, 403, "Akses hanya untuk administrator.");
  return next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/users", asyncHandler(authenticate), asyncHandler(requireAdmin), asyncHandler(async (_req, res) => {
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return responseError(res, 502, "Daftar akun tidak dapat dimuat: " + error.message);
  return res.json({ users: data.users.map((user) => ({
    id: user.id,
    email: user.email,
    banned_until: user.banned_until || null,
    created_at: user.created_at
  })) });
}));

app.post("/api/users", asyncHandler(authenticate), asyncHandler(requireAdmin), asyncHandler(async (req, res) => {
  const { full_name, email, password, department_id, role } = req.body || {};
  if (typeof full_name !== "string" || !full_name.trim() || full_name.trim().length > 120) {
    return responseError(res, 400, "Nama wajib diisi dan maksimal 120 karakter.");
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return responseError(res, 400, "Alamat email tidak valid.");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return responseError(res, 400, "Password sementara minimal 8 karakter.");
  }
  if (typeof department_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(department_id)) {
    return responseError(res, 400, "Departemen wajib dipilih.");
  }
  if (role !== "admin" && role !== "employee") return responseError(res, 400, "Role tidak valid.");

  const { data: department, error: departmentError } = await adminClient
    .from("departments").select("id").eq("id", department_id).maybeSingle();
  if (departmentError) return responseError(res, 502, "Departemen gagal diverifikasi.");
  if (!department) return responseError(res, 400, "Departemen tidak ditemukan.");

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim() }
  });
  if (createError) return responseError(res, 400, createError.message);

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: created.user.id,
    full_name: full_name.trim(),
    email: email.trim().toLowerCase(),
    department_id,
    role
  });
  if (profileError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(created.user.id);
    const suffix = cleanupError ? " Akun Auth sementara juga gagal dibersihkan: " + cleanupError.message : "";
    return responseError(res, 502, "Akun Auth dibuat tetapi profil gagal disimpan: " + profileError.message + suffix);
  }
  return res.status(201).json({ user: { id: created.user.id, email: created.user.email } });
}));

app.patch("/api/users/:id/profile", asyncHandler(authenticate), asyncHandler(requireAdmin), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { full_name, email, department_id, role } = req.body || {};
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return responseError(res, 400, "ID pengguna tidak valid.");
  }
  if (typeof full_name !== "string" || !full_name.trim() || full_name.trim().length > 120) {
    return responseError(res, 400, "Nama wajib diisi dan maksimal 120 karakter.");
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return responseError(res, 400, "Alamat email tidak valid.");
  }
  if (typeof department_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(department_id)) {
    return responseError(res, 400, "Departemen wajib dipilih.");
  }
  if (role !== "admin" && role !== "employee") return responseError(res, 400, "Role tidak valid.");
  if (id === req.user.id && role !== "admin") return responseError(res, 400, "Anda tidak dapat mengubah role akun sendiri.");

  const [{ data: target, error: targetError }, { data: department, error: departmentError }] = await Promise.all([
    adminClient.from("profiles").select("id, role, is_active").eq("id", id).single(),
    adminClient.from("departments").select("id").eq("id", department_id).maybeSingle()
  ]);
  if (targetError || !target) return responseError(res, 404, "Profil pengguna tidak ditemukan.");
  if (departmentError) return responseError(res, 502, "Departemen gagal diverifikasi.");
  if (!department) return responseError(res, 400, "Departemen tidak ditemukan.");

  if (target.is_active && target.role === "admin" && role !== "admin") {
    const { count, error: countError } = await adminClient.from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);
    if (countError) return responseError(res, 502, "Jumlah administrator aktif gagal diverifikasi.");
    if (count <= 1) return responseError(res, 409, "Sistem harus memiliki setidaknya satu administrator aktif.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { data: authData, error: authLookupError } = await adminClient.auth.admin.getUserById(id);
  if (authLookupError || !authData.user) return responseError(res, 404, "Akun autentikasi tidak ditemukan.");
  const oldAuthUser = authData.user;
  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(id, {
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: { ...oldAuthUser.user_metadata, full_name: full_name.trim() }
  });
  if (authUpdateError) return responseError(res, 400, "Akun autentikasi gagal diperbarui: " + authUpdateError.message);

  const { error: profileUpdateError } = await adminClient.from("profiles").update({
    full_name: full_name.trim(),
    email: normalizedEmail,
    department_id,
    role
  }).eq("id", id);
  if (profileUpdateError) {
    const { error: rollbackError } = await adminClient.auth.admin.updateUserById(id, {
      email: oldAuthUser.email,
      email_confirm: true,
      user_metadata: oldAuthUser.user_metadata
    });
    const rollbackMessage = rollbackError ? " Sinkronisasi akun Auth gagal dipulihkan: " + rollbackError.message : "";
    return responseError(res, 409, "Profil gagal diperbarui: " + profileUpdateError.message + rollbackMessage);
  }
  return res.json({ id, full_name: full_name.trim(), email: normalizedEmail, department_id, role });
}));

app.patch("/api/users/:id/status", asyncHandler(authenticate), asyncHandler(requireAdmin), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return responseError(res, 400, "ID pengguna tidak valid.");
  }
  if (id === req.user.id) return responseError(res, 400, "Administrator tidak dapat menonaktifkan akunnya sendiri.");
  if (typeof req.body.active !== "boolean") return responseError(res, 400, "Status active wajib berupa boolean.");
  if (!req.body.active) {
    const { data: target, error: targetError } = await adminClient.from("profiles")
      .select("role, is_active")
      .eq("id", id)
      .maybeSingle();
    if (targetError) return responseError(res, 502, "Profil pengguna gagal diverifikasi.");
    if (!target) return responseError(res, 404, "Profil pengguna tidak ditemukan.");
    if (target.role === "admin" && target.is_active) {
      const { count, error: countError } = await adminClient.from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true);
      if (countError) return responseError(res, 502, "Jumlah administrator aktif gagal diverifikasi.");
      if (count <= 1) return responseError(res, 409, "Sistem harus memiliki setidaknya satu administrator aktif.");
    }
  }
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .update({ is_active: req.body.active })
    .eq("id", id)
    .select("id")
    .single();
  if (profileError || !profile) return responseError(res, 404, "Profil pengguna tidak dapat diperbarui.");
  const { data: updated, error } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: req.body.active ? "none" : "876000h"
  });
  if (error) {
    const { error: rollbackError } = await adminClient
      .from("profiles")
      .update({ is_active: !req.body.active })
      .eq("id", id);
    const rollbackMessage = rollbackError ? " Sinkronisasi profil gagal dipulihkan: " + rollbackError.message : "";
    return responseError(res, 400, "Status akun gagal diperbarui: " + error.message + rollbackMessage);
  }
  return res.json({ id: updated.user.id, active: req.body.active });
}));

app.use((err, _req, res, _next) => {
  console.error(err.message);
  return responseError(res, 500, "Permintaan server gagal diproses.");
});

app.listen(port, host, () => {
  console.log("ReimFlow API listening on http://" + host + ":" + port);
});
