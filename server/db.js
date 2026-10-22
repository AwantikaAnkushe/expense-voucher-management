import initSqlJs from "sql.js";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(directory, "data");
const databasePath = path.join(dataDirectory, "expenses.sqlite");
fs.mkdirSync(dataDirectory, { recursive: true });

const SQL = await initSqlJs();
const native = fs.existsSync(databasePath)
  ? new SQL.Database(new Uint8Array(fs.readFileSync(databasePath)))
  : new SQL.Database();
native.run("PRAGMA foreign_keys = ON");

class SQLiteDatabase {
  constructor(database) {
    this.database = database;
    this.inTransaction = false;
  }

  persist() {
    if (!this.inTransaction) fs.writeFileSync(databasePath, Buffer.from(this.database.export()));
  }

  exec(sql) {
    this.database.exec(sql);
    this.persist();
  }

  prepare(sql) {
    return {
      get: (...params) => {
        const statement = this.database.prepare(sql);
        try {
          statement.bind(params);
          return statement.step() ? statement.getAsObject() : undefined;
        } finally {
          statement.free();
        }
      },
      all: (...params) => {
        const statement = this.database.prepare(sql);
        try {
          statement.bind(params);
          const rows = [];
          while (statement.step()) rows.push(statement.getAsObject());
          return rows;
        } finally {
          statement.free();
        }
      },
      run: (...params) => {
        this.database.run(sql, params);
        const changes = this.database.getRowsModified();
        const lastInsertRowid = this.database.exec("SELECT last_insert_rowid() AS id")[0]?.values[0]?.[0] || 0;
        this.persist();
        return { changes, lastInsertRowid };
      },
    };
  }

  transaction(callback) {
    return (...args) => {
      this.database.run("BEGIN IMMEDIATE");
      this.inTransaction = true;
      try {
        const result = callback(...args);
        this.database.run("COMMIT");
        this.inTransaction = false;
        this.persist();
        return result;
      } catch (error) {
        this.database.run("ROLLBACK");
        this.inTransaction = false;
        throw error;
      }
    };
  }
}

const db = new SQLiteDatabase(native);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('employee', 'director', 'accounts')),
    department TEXT NOT NULL DEFAULT '',
    employee_id TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_number TEXT NOT NULL UNIQUE,
    voucher_date TEXT NOT NULL,
    expense_date TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL CHECK(amount > 0),
    employee_id INTEGER NOT NULL REFERENCES users(id),
    employee_signature TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending', 'approved', 'rejected')),
    director_signature TEXT,
    approval_date TEXT,
    rejection_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS signature_files (
    filename TEXT PRIMARY KEY,
    uploader_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_vouchers_employee ON vouchers(employee_id);
  CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
`);

const demoUsers = [
  { name: "Ava Johnson", email: "employee@abc.com", password: "Employee123!", role: "employee", department: "Engineering", employeeId: "EMP-1042" },
  { name: "Jordan Lee", email: "director@abc.com", password: "Director123!", role: "director", department: "Executive", employeeId: "DIR-001" },
  { name: "Morgan Chen", email: "accounts@abc.com", password: "Accounts123!", role: "accounts", department: "Finance", employeeId: "ACC-001" },
];
const addUser = db.prepare("INSERT OR IGNORE INTO users (name, email, password_hash, role, department, employee_id) VALUES (?, ?, ?, ?, ?, ?)");
const seed = db.transaction(() => {
  for (const user of demoUsers) {
    addUser.run(user.name, user.email, bcrypt.hashSync(user.password, 10), user.role, user.department, user.employeeId);
  }
});
seed();

export default db;
