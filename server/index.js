import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import db from "./db.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || "development-only-change-this-secret";
if (process.env.NODE_ENV === "production" && jwtSecret === "development-only-change-this-secret") {
  throw new Error("Set JWT_SECRET to a strong, private value before running in production.");
}
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.join(serverDirectory, "..", "dist");
const uploadsDirectory = path.join(serverDirectory, "uploads");
fs.mkdirSync(uploadsDirectory, { recursive: true });

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadsDirectory),
  filename: (_req, file, callback) => {
    const extension = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[file.mimetype];
    callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
    callback(allowed.has(file.mimetype) ? null : new Error("Upload a PNG, JPEG, or WebP image."), allowed.has(file.mimetype));
  },
});

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in to continue." });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ error: "You do not have permission to perform this action." });
}

function serializeVoucher(row) {
  return {
    ...row,
    employee_name: row.employee_name,
    employee_code: row.employee_code,
    employee_email: row.employee_email,
  };
}

const voucherSelect = `
  SELECT v.*, u.name AS employee_name, u.employee_id AS employee_code, u.email AS employee_email
  FROM vouchers v JOIN users u ON u.id = v.employee_id
`;

function getVoucher(id) {
  return db.prepare(`${voucherSelect} WHERE v.id = ?`).get(id);
}

function canViewVoucher(user, voucher) {
  return user.role !== "employee" || voucher.employee_id === user.id;
}

app.post("/api/auth/login", (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department, employeeId: user.employee_id },
    jwtSecret,
    { expiresIn: "8h" },
  );
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department, employeeId: user.employee_id } });
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

app.post("/api/uploads/signature", requireAuth, allowRoles("employee", "director"), upload.single("signature"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a signature image to upload." });
  const bytes = fs.readFileSync(req.file.path);
  const validPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const validJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const validWebp = bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!validPng && !validJpeg && !validWebp) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "The uploaded file is not a valid PNG, JPEG, or WebP image." });
  }
  db.prepare("INSERT INTO signature_files (filename, uploader_id) VALUES (?, ?)").run(req.file.filename, req.user.id);
  return res.status(201).json({ url: `/api/signatures/${req.file.filename}` });
});

app.get("/api/signatures/:filename", requireAuth, (req, res) => {
  const filename = req.params.filename;
  if (path.basename(filename) !== filename) return res.status(400).json({ error: "Invalid signature image." });
  const signature = db.prepare("SELECT uploader_id FROM signature_files WHERE filename = ?").get(filename);
  if (!signature) return res.status(404).json({ error: "Signature image not found." });
  const url = `/api/signatures/${filename}`;
  const isOwner = signature.uploader_id === req.user.id;
  const linked = req.user.role === "employee"
    ? db.prepare("SELECT 1 AS linked FROM vouchers WHERE employee_id = ? AND (employee_signature = ? OR director_signature = ?)").get(req.user.id, url, url)
    : db.prepare("SELECT 1 AS linked FROM vouchers WHERE employee_signature = ? OR director_signature = ?").get(url, url);
  if (!isOwner && !linked) return res.status(403).json({ error: "You do not have permission to view this signature." });
  const filePath = path.join(uploadsDirectory, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Signature image not found." });
  return res.sendFile(filePath);
});

app.get("/api/dashboard", requireAuth, (req, res) => {
  const where = req.user.role === "employee" ? "WHERE employee_id = ?" : "";
  const params = req.user.role === "employee" ? [req.user.id] : [];
  const rows = db.prepare(`SELECT id, status, amount, approval_date, voucher_number, title, department, expense_date, created_at FROM vouchers ${where}`).all(...params);
  const count = (status) => rows.filter((voucher) => voucher.status === status).length;
  const today = new Date().toISOString().slice(0, 10);
  const approvedToday = rows.filter((voucher) => voucher.status === "approved" && voucher.approval_date?.slice(0, 10) === today);
  const rejectedToday = rows.filter((voucher) => voucher.status === "rejected" && voucher.updated_at?.slice(0, 10) === today);
  const recentRows = req.user.role === "accounts" ? rows.filter((voucher) => voucher.status === "approved") : rows;
  const recent = [...recentRows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  return res.json({
    total: rows.length,
    draft: count("draft"),
    pending: count("pending"),
    approved: count("approved"),
    rejected: count("rejected"),
    totalAmount: rows.reduce((sum, item) => sum + item.amount, 0),
    pendingAmount: rows.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.amount, 0),
    approvedAmount: rows.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amount, 0),
    approvedToday: approvedToday.length,
    rejectedToday: rejectedToday.length,
    recent: recent.map((item) => ({ ...item })),
  });
});

app.get("/api/vouchers", requireAuth, (req, res) => {
  const clauses = [];
  const params = [];
  if (req.user.role === "employee") {
    clauses.push("v.employee_id = ?");
    params.push(req.user.id);
  }
  if (req.query.status && ["draft", "pending", "approved", "rejected"].includes(req.query.status)) {
    clauses.push("v.status = ?");
    params.push(req.query.status);
  }
  if (req.query.q) {
    clauses.push("(v.voucher_number LIKE ? OR u.name LIKE ? OR v.department LIKE ? OR v.title LIKE ? OR v.category LIKE ?)");
    const query = `%${String(req.query.q).slice(0, 100)}%`;
    params.push(query, query, query, query, query);
  }
  if (req.query.from) { clauses.push("v.expense_date >= ?"); params.push(req.query.from); }
  if (req.query.to) { clauses.push("v.expense_date <= ?"); params.push(req.query.to); }
  if (req.query.minAmount && Number.isFinite(Number(req.query.minAmount))) { clauses.push("v.amount >= ?"); params.push(Number(req.query.minAmount)); }
  if (req.query.maxAmount && Number.isFinite(Number(req.query.maxAmount))) { clauses.push("v.amount <= ?"); params.push(Number(req.query.maxAmount)); }
  const order = req.query.sort === "amount" ? "v.amount" : req.query.sort === "date" ? "v.expense_date" : "v.created_at";
  const direction = req.query.direction === "asc" ? "ASC" : "DESC";
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`${voucherSelect} ${where} ORDER BY ${order} ${direction}`).all(...params);
  return res.json(rows.map(serializeVoucher));
});

app.get("/api/vouchers/:id", requireAuth, (req, res) => {
  const voucher = getVoucher(Number(req.params.id));
  if (!voucher) return res.status(404).json({ error: "Voucher not found." });
  if (!canViewVoucher(req.user, voucher)) return res.status(403).json({ error: "You can only view your own vouchers." });
  return res.json(serializeVoucher(voucher));
});

function validateVoucher(body, submitting = false) {
  const errors = {};
  const requiredFields = ["department", "title", "expense_date"];
  for (const field of requiredFields) {
    if (typeof body[field] !== "string" || !body[field].trim()) errors[field] = "This field is required.";
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Enter an amount greater than zero.";
  if (submitting && !body.employee_signature) errors.employee_signature = "Add your signature before submitting.";
  return errors;
}

app.post("/api/vouchers", requireAuth, allowRoles("employee"), (req, res) => {
  const errors = validateVoucher(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Check the voucher details.", fields: errors });
  const createVoucher = db.transaction(() => {
    const created = db.prepare(`
      INSERT INTO vouchers (voucher_number, voucher_date, expense_date, department, title, category, description, amount, employee_id, employee_signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`TMP-${randomUUID()}`, new Date().toISOString(), req.body.expense_date, req.body.department.trim(), req.body.title.trim(), String(req.body.category || "").trim(), String(req.body.description || "").trim(), Number(req.body.amount), req.user.id, req.body.employee_signature || null);
    const voucherNumber = `VCH-${new Date().getFullYear()}-${String(created.lastInsertRowid).padStart(6, "0")}`;
    db.prepare("UPDATE vouchers SET voucher_number = ? WHERE id = ?").run(voucherNumber, created.lastInsertRowid);
    return created.lastInsertRowid;
  });
  const voucherId = createVoucher();
  return res.status(201).json(serializeVoucher(getVoucher(voucherId)));
});

app.put("/api/vouchers/:id", requireAuth, allowRoles("employee"), (req, res) => {
  const voucher = getVoucher(Number(req.params.id));
  if (!voucher) return res.status(404).json({ error: "Voucher not found." });
  if (voucher.employee_id !== req.user.id) return res.status(403).json({ error: "You can only edit your own drafts." });
  if (voucher.status !== "draft") return res.status(409).json({ error: "Only draft vouchers can be edited." });
  const errors = validateVoucher(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Check the voucher details.", fields: errors });
  db.prepare(`
    UPDATE vouchers SET expense_date = ?, department = ?, title = ?, category = ?, description = ?, amount = ?,
    employee_signature = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(req.body.expense_date, req.body.department.trim(), req.body.title.trim(), String(req.body.category || "").trim(), String(req.body.description || "").trim(), Number(req.body.amount), req.body.employee_signature || null, voucher.id);
  return res.json(serializeVoucher(getVoucher(voucher.id)));
});

app.delete("/api/vouchers/:id", requireAuth, allowRoles("employee"), (req, res) => {
  const voucher = getVoucher(Number(req.params.id));
  if (!voucher) return res.status(404).json({ error: "Voucher not found." });
  if (voucher.employee_id !== req.user.id || voucher.status !== "draft") return res.status(409).json({ error: "Only your own draft vouchers can be deleted." });
  db.prepare("DELETE FROM vouchers WHERE id = ?").run(voucher.id);
  return res.status(204).end();
});

app.post("/api/vouchers/:id/submit", requireAuth, allowRoles("employee"), (req, res) => {
  const voucher = getVoucher(Number(req.params.id));
  if (!voucher) return res.status(404).json({ error: "Voucher not found." });
  if (voucher.employee_id !== req.user.id) return res.status(403).json({ error: "You can only submit your own vouchers." });
  if (voucher.status !== "draft") return res.status(409).json({ error: "Only draft vouchers can be submitted." });
  const signature = req.body.employee_signature || voucher.employee_signature;
  const errors = validateVoucher({ ...voucher, employee_signature: signature }, true);
  if (Object.keys(errors).length) return res.status(400).json({ error: "A valid voucher and employee signature are required.", fields: errors });
  db.prepare("UPDATE vouchers SET employee_signature = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(signature, voucher.id);
  return res.json(serializeVoucher(getVoucher(voucher.id)));
});

app.post("/api/vouchers/:id/approve", requireAuth, allowRoles("director"), (req, res) => {
  const voucher = getVoucher(Number(req.params.id));
  if (!voucher) return res.status(404).json({ error: "Voucher not found." });
  if (voucher.status !== "pending") return res.status(409).json({ error: "Only pending vouchers can be approved." });
  if (typeof req.body.director_signature !== "string" || !req.body.director_signature.trim()) return res.status(400).json({ error: "Director signature is required." });
  db.prepare("UPDATE vouchers SET status = 'approved', director_signature = ?, approval_date = ?, rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(req.body.director_signature, new Date().toISOString(), voucher.id);
  return res.json(serializeVoucher(getVoucher(voucher.id)));
});

app.post("/api/vouchers/:id/reject", requireAuth, allowRoles("director"), (req, res) => {
  const voucher = getVoucher(Number(req.params.id));
  if (!voucher) return res.status(404).json({ error: "Voucher not found." });
  if (voucher.status !== "pending") return res.status(409).json({ error: "Only pending vouchers can be rejected." });
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!reason) return res.status(400).json({ error: "A rejection reason is required." });
  db.prepare("UPDATE vouchers SET status = 'rejected', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(reason, voucher.id);
  return res.json(serializeVoucher(getVoucher(voucher.id)));
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use(express.static(clientDirectory));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  return res.sendFile(path.join(clientDirectory, "index.html"), (error) => { if (error) next(error); });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "Signature images must be 2 MB or smaller." : error.message;
    return res.status(400).json({ error: message });
  }
  if (error.message === "Upload a PNG, JPEG, or WebP image.") return res.status(400).json({ error: error.message });
  console.error(error);
  return res.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(port, () => console.log(`ExpenseFlow API listening on http://localhost:${port}`));
