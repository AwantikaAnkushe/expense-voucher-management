import { useEffect, useState } from "react";

const API = "/api";
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
const date = (value) => value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const roleNames = { employee: "Employee", director: "Director", accounts: "Accounts team" };

async function request(path, token, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}

function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem("expenseflow-auth")) || null; } catch { return null; }
  });
  const [page, setPage] = useState("dashboard");
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (auth) localStorage.setItem("expenseflow-auth", JSON.stringify(auth));
    else localStorage.removeItem("expenseflow-auth");
  }, [auth]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(""), 3400);
    return () => clearTimeout(timeout);
  }, [toast]);

  if (!auth) return <Login onLogin={setAuth} />;

  const { token, user } = auth;
  const go = (next, intent) => { setSelected(null); setEditing(intent === "create" ? false : null); setPage(next); };
  const changed = (message) => { setRefresh((n) => n + 1); setToast(message); };
  const logout = () => { setAuth(null); setPage("dashboard"); };
  const openEditor = (voucher = null) => { setEditing(voucher || false); setSelected(null); };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); go("dashboard"); }}>
          <span className="brand-icon"><BrandIcon /></span>
          <span>expense<span className="brand-accent">flow</span><small>VOUCHER MANAGEMENT</small></span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav className="nav-items">
          <button className={page === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => go("dashboard")}><GridIcon /> Overview</button>
          {user.role === "employee" && <button className={page === "vouchers" ? "nav-item active" : "nav-item"} onClick={() => go("vouchers")}><ReceiptIcon /> My vouchers</button>}
          {user.role !== "employee" && <button className={page === "vouchers" ? "nav-item active" : "nav-item"} onClick={() => go("vouchers")}><ReceiptIcon /> All vouchers</button>}
          {user.role === "director" && <button className={page === "pending" ? "nav-item active" : "nav-item"} onClick={() => go("pending")}><ClockIcon /> Pending approvals</button>}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-mark">?</div><strong>Need a hand?</strong><p>Reach out to your finance team for help with a reimbursement.</p></div>
          <button className="profile" onClick={logout}>
            <span className="avatar">{user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
            <span className="profile-copy"><strong>{user.name}</strong><small>{roleNames[user.role]}</small></span>
            <span className="logout-mark">↗</span>
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">Workspace <span>/</span> <strong>{page === "dashboard" ? "Overview" : page === "pending" ? "Pending approvals" : "Vouchers"}</strong></div>
          <div className="topbar-right"><span className="date-label"><CalendarIcon /> {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span><span className="top-avatar">{user.name[0]}</span></div>
        </header>
        <div className="page-content">
          {page === "dashboard"
            ? <Dashboard token={token} user={user} refresh={refresh} onNavigate={go} onSelect={setSelected} />
            : <VoucherList token={token} user={user} refresh={refresh} pendingOnly={page === "pending"} onSelect={setSelected} onEdit={openEditor} onChanged={changed} onCreate={() => openEditor(null)} />}
        </div>
      </main>
      {selected && <VoucherDetails voucher={selected} token={token} user={user} onClose={() => setSelected(null)} onChanged={changed} />}
      {editing !== null && <VoucherEditor voucher={editing || undefined} token={token} user={user} onClose={() => setEditing(null)} onSaved={(message) => { setEditing(null); changed(message); }} />}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("employee@abc.com");
  const [password, setPassword] = useState("Employee123!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const presets = [
    ["Employee", "employee@abc.com", "Employee123!"],
    ["Director", "director@abc.com", "Director123!"],
    ["Accounts", "accounts@abc.com", "Accounts123!"],
  ];
  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await request("/auth/login", null, { method: "POST", body: JSON.stringify({ email, password }) });
      onLogin(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="login-shell">
      <section className="login-visual">
        <div className="login-brand"><span className="brand-icon"><BrandIcon /></span> expense<span className="brand-accent">flow</span></div>
        <div className="visual-copy"><span className="eyebrow light">EXPENSE MANAGEMENT, REIMAGINED</span><h1>Good work<br />deserves to be<br /><em>reimbursed.</em></h1><p>One clear path from expense to approval. Track every voucher, every step of the way.</p></div>
        <div className="visual-foot"><span>✳</span> Made for teams that move work forward <span className="visual-foot-right">01 — 03</span></div>
        <div className="visual-orb orb-one" /><div className="visual-orb orb-two" />
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <span className="eyebrow">WELCOME BACK</span><h2>Sign in to ExpenseFlow</h2><p className="login-subtitle">Use your company account to continue.</p>
          <form onSubmit={submit}>
            <label>Email address<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            {error && <div className="form-error">{error}</div>}
            <button className="button primary full" disabled={busy}>{busy ? "Signing in…" : "Sign in"} <span>→</span></button>
          </form>
          <div className="demo-box"><div className="demo-heading">DEMO ACCESS <span>Choose a role to explore</span></div><div className="demo-roles">{presets.map(([role, userEmail, userPassword]) => <button key={role} onClick={() => { setEmail(userEmail); setPassword(userPassword); setError(""); }}>{role}</button>)}</div></div>
          <div className="secure-note"><ShieldIcon /> Secure access · Role-based permissions</div>
        </div>
      </section>
    </div>
  );
}

function Dashboard({ token, user, refresh, onNavigate, onSelect }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request("/dashboard", token).then(setData).catch((err) => setError(err.message));
  }, [token, refresh]);
  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  const employee = user.role === "employee";
  const cards = employee
    ? [["Total vouchers", data.total, "all time", "blue", <ReceiptIcon />], ["Drafts", data.draft, "not submitted yet", "violet", <EditIcon />], ["Pending approval", data.pending, "with your director", "amber", <ClockIcon />], ["Approved", data.approved, "ready for reimbursement", "green", <CheckIcon />]]
    : user.role === "director"
      ? [["Pending approval", data.pending, "needs your review", "amber", <ClockIcon />], ["Approved today", data.approvedToday, "vouchers reviewed", "green", <CheckIcon />], ["Rejected today", data.rejectedToday, "with feedback sent", "rose", <CloseIcon />], ["Pending amount", money(data.pendingAmount), "awaiting your decision", "blue", <WalletIcon />]]
      : [["Total vouchers", data.total, "across the organization", "blue", <ReceiptIcon />], ["Pending approval", data.pending, "awaiting director", "amber", <ClockIcon />], ["Approved", data.approved, "ready to process", "green", <CheckIcon />], ["Approved amount", money(data.approvedAmount), "total reimbursements", "violet", <WalletIcon />]];
  return (
    <>
      <div className="welcome-row"><div><span className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</span><h1>{greeting()}, {user.name.split(" ")[0]} <span className="wave">✳</span></h1><p>{employee ? "Here’s what’s happening with your expense vouchers." : user.role === "director" ? "Here’s your approval overview for today." : "Here’s the reimbursement activity across your organization."}</p></div>
        {employee && <button className="button primary" onClick={() => onNavigate("vouchers", "create")}><span className="plus">+</span> New voucher</button>}
      </div>
      <div className="stats-grid">{cards.map(([label, value, caption, color, icon]) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${color}`}>{icon}</span></div><strong className="stat-value">{value}</strong><span className="stat-caption">{caption}</span></div>)}</div>
      {employee && <div className="summary-strip"><div><span className="strip-icon"><WalletIcon /></span><div><small>Total amount claimed</small><strong>{money(data.totalAmount)}</strong></div></div><div className="strip-divider" /><div className="strip-status"><span className="status-dot draft-dot" /> {data.draft} drafts</div><div className="strip-status"><span className="status-dot rejected-dot" /> {data.rejected} rejected</div><button className="text-link" onClick={() => onNavigate("vouchers")}>View all vouchers <span>→</span></button></div>}
      <section className="section-card activity-card"><div className="section-heading"><div><h2>{employee ? "Recent vouchers" : user.role === "director" ? "Recent voucher activity" : "Recent approved vouchers"}</h2><p>{employee ? "Your latest reimbursement requests" : "Latest activity across the organization"}</p></div><button className="text-link" onClick={() => onNavigate("vouchers")}>View all <span>→</span></button></div>
        {data.recent.length ? <div className="recent-list">{data.recent.map((item) => <button className="recent-row" key={item.voucher_number} onClick={async () => { try { onSelect(await request(`/vouchers/${item.id}`, token)); } catch { /* refreshed list will show current state */ } }}><span className="receipt-tile"><ReceiptIcon /></span><span className="recent-main"><strong>{item.title}</strong><small>{item.voucher_number} <i>·</i> {item.department}</small></span><span className="recent-amount">{money(item.amount)}</span><StatusBadge status={item.status} /><span className="recent-date">{date(item.expense_date)}</span><span className="chevron">›</span></button>)}</div> : <EmptyState title="No vouchers yet" text={employee ? "Your vouchers will show up here once you create one." : "New voucher activity will appear here."} />}
      </section>
      {user.role === "director" && <div className="approval-banner"><span className="banner-icon"><ClockIcon /></span><div><strong>{data.pending ? `${data.pending} voucher${data.pending === 1 ? "" : "s"} need your attention` : "You’re all caught up"}</strong><p>Review expense details and make a decision when you’re ready.</p></div><button className="button dark-button" onClick={() => onNavigate("pending")}>Review approvals <span>→</span></button></div>}
    </>
  );
}

function VoucherList({ token, user, refresh, pendingOnly, onSelect, onEdit, onChanged, onCreate }) {
  const [vouchers, setVouchers] = useState([]);
  const [filters, setFilters] = useState({ q: "", status: pendingOnly ? "pending" : "", from: "", to: "", minAmount: "", maxAmount: "", sort: "date", direction: "desc" });
  const [error, setError] = useState("");
  useEffect(() => { if (pendingOnly) setFilters((current) => ({ ...current, status: "pending" })); }, [pendingOnly]);
  useEffect(() => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    request(`/vouchers?${params}`, token).then((rows) => { setVouchers(rows); setError(""); }).catch((err) => setError(err.message));
  }, [token, refresh, filters]);
  const heading = pendingOnly ? "Pending approvals" : user.role === "employee" ? "My vouchers" : "All vouchers";
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  async function submit(voucher) {
    try { await request(`/vouchers/${voucher.id}/submit`, token, { method: "POST", body: JSON.stringify({}) }); onChanged("Voucher submitted for approval."); }
    catch (err) { setError(err.message); }
  }
  async function remove(voucher) {
    if (!window.confirm(`Delete draft ${voucher.voucher_number}? This can’t be undone.`)) return;
    try { await request(`/vouchers/${voucher.id}`, token, { method: "DELETE" }); onChanged("Draft voucher deleted."); }
    catch (err) { setError(err.message); }
  }
  return (
    <>
      <div className="page-title-row"><div><span className="eyebrow">{pendingOnly ? "ACTION REQUIRED" : "EXPENSE MANAGEMENT"}</span><h1>{heading}</h1><p>{pendingOnly ? "Review requests submitted by your team." : user.role === "employee" ? "Keep track of your submitted and draft expenses." : "Search and monitor expense requests from your organization."}</p></div>{user.role === "employee" && <button className="button primary" onClick={onCreate}><span className="plus">+</span> New voucher</button>}</div>
      <section className="section-card voucher-section">
        <div className="filter-bar"><div className="search-wrap"><SearchIcon /><input placeholder="Search number, employee, department…" value={filters.q} onChange={(e) => setFilter("q", e.target.value)} /></div>
          <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="pending">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
          <select value={`${filters.sort}:${filters.direction}`} onChange={(e) => { const [sort, direction] = e.target.value.split(":"); setFilters((current) => ({ ...current, sort, direction })); }}><option value="date:desc">Newest first</option><option value="date:asc">Oldest first</option><option value="amount:desc">Amount: high to low</option><option value="amount:asc">Amount: low to high</option></select>
          <details className="filter-menu"><summary><FilterIcon /> Filters</summary><div className="filter-popover"><label>Expense date from<input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} /></label><label>Expense date to<input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} /></label><div className="range-fields"><label>Min amount<input type="number" min="0" placeholder="$0" value={filters.minAmount} onChange={(e) => setFilter("minAmount", e.target.value)} /></label><label>Max amount<input type="number" min="0" placeholder="Any" value={filters.maxAmount} onChange={(e) => setFilter("maxAmount", e.target.value)} /></label></div><button className="text-link" onClick={() => setFilters({ q: "", status: pendingOnly ? "pending" : "", from: "", to: "", minAmount: "", maxAmount: "", sort: "date", direction: "desc" })}>Clear filters</button></div></details>
        </div>
        {error && <div className="inline-error">{error}</div>}
        {vouchers.length ? <div className="table-scroll"><table><thead><tr><th>VOUCHER</th><th>{user.role === "employee" ? "DEPARTMENT" : "EMPLOYEE"}</th><th>EXPENSE</th><th>DATE</th><th>AMOUNT</th><th>STATUS</th><th /></tr></thead><tbody>{vouchers.map((voucher) => <tr key={voucher.id}>
          <td><button className="voucher-number" onClick={() => onSelect(voucher)}>{voucher.voucher_number}</button><small className="cell-sub">{voucher.title}</small></td>
          <td>{user.role === "employee" ? voucher.department : <><span className="employee-name">{voucher.employee_name}</span><small className="cell-sub">{voucher.department}</small></>}</td>
          <td><span>{voucher.category || "General"}</span><small className="cell-sub">{voucher.expense_date ? date(voucher.expense_date) : "—"}</small></td>
          <td>{date(voucher.voucher_date)}</td><td className="amount-cell">{money(voucher.amount)}</td><td><StatusBadge status={voucher.status} /></td>
          <td><div className="row-actions">{user.role === "employee" && voucher.status === "draft" && <><button title="Edit draft" onClick={() => onEdit(voucher)}><EditIcon /></button><button title="Submit for approval" onClick={() => submit(voucher)}><SendIcon /></button><button title="Delete draft" onClick={() => remove(voucher)}><TrashIcon /></button></>}<button title="View details" onClick={() => onSelect(voucher)}><ChevronIcon /></button></div></td>
        </tr>)}</tbody></table></div> : !error && <EmptyState title="No vouchers found" text="Try changing your search or filters." />}
      </section>
      <div className="list-footnote"><span>{vouchers.length} {vouchers.length === 1 ? "voucher" : "vouchers"}</span><span>All amounts in USD</span></div>
    </>
  );
}

function VoucherEditor({ voucher, token, user, onClose, onSaved }) {
  const [form, setForm] = useState(() => voucher ? { department: voucher.department, title: voucher.title, expense_date: voucher.expense_date, category: voucher.category || "", description: voucher.description || "", amount: voucher.amount, employee_signature: voucher.employee_signature || "" } : { department: user.department || "", title: "", expense_date: new Date().toISOString().slice(0, 10), category: "", description: "", amount: "", employee_signature: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function signature(file) {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const payload = new FormData(); payload.append("signature", file);
      const result = await request("/uploads/signature", token, { method: "POST", body: payload });
      setField("employee_signature", result.url);
    } catch (err) { setError(err.message); }
    finally { setUploading(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await request(voucher ? `/vouchers/${voucher.id}` : "/vouchers", token, { method: voucher ? "PUT" : "POST", body: JSON.stringify(form) });
      onSaved(voucher ? "Draft changes saved." : `Draft ${result.voucher_number} created.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal editor-modal"><div className="modal-heading"><div><span className="eyebrow">{voucher ? "EDIT DRAFT" : "NEW EXPENSE"}</span><h2>{voucher ? "Edit voucher" : "Create a voucher"}</h2><p>Your voucher is saved as a draft until you submit it.</p></div><button className="icon-button" onClick={onClose}>×</button></div>
    <form onSubmit={save} className="voucher-form"><div className="form-grid"><label>Department <span>*</span><input required value={form.department} onChange={(e) => setField("department", e.target.value)} placeholder="e.g. Engineering" /></label><label>Expense title <span>*</span><input required value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Client travel" /></label><label>Expense date <span>*</span><input required type="date" value={form.expense_date} onChange={(e) => setField("expense_date", e.target.value)} /></label><label>Amount (USD) <span>*</span><div className="amount-input"><span>$</span><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setField("amount", e.target.value)} placeholder="0.00" /></div></label><label className="full-span">Category<select value={form.category} onChange={(e) => setField("category", e.target.value)}><option value="">Select a category</option>{["Travel", "Meals & entertainment", "Office supplies", "Software & subscriptions", "Training", "Transportation", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="full-span">Description<textarea rows="3" value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="Add context for your expense…" /></label></div>
      <div className="signature-upload"><div><strong>Your signature</strong><small>PNG, JPG, or WebP · max 2 MB. Required before submission.</small></div><label className="upload-button">{uploading ? "Uploading…" : form.employee_signature ? "Change image" : "Upload image"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => signature(e.target.files?.[0])} /></label><ProtectedImage src={form.employee_signature} token={token} alt="Employee signature" /></div>
      {error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || uploading}>{busy ? "Saving…" : "Save as draft"} <span>→</span></button></div>
    </form></section></div>;
}

function VoucherDetails({ voucher, token, user, onClose, onChanged }) {
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [signature, setSignature] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  async function upload(file) {
    if (!file) return;
    setUploading(true); setError("");
    try { const data = new FormData(); data.append("signature", file); const result = await request("/uploads/signature", token, { method: "POST", body: data }); setSignature(result.url); }
    catch (err) { setError(err.message); }
    finally { setUploading(false); }
  }
  async function decision(action) {
    setBusy(true); setError("");
    try {
      await request(`/vouchers/${voucher.id}/${action}`, token, { method: "POST", body: JSON.stringify(action === "approve" ? { director_signature: signature } : { reason }) });
      onClose(); onChanged(action === "approve" ? "Voucher approved." : "Voucher rejected. Employee has been notified.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const canReview = user.role === "director" && voucher.status === "pending";
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal detail-modal">
    <div className="detail-top"><div><span className="eyebrow">VOUCHER DETAILS</span><h2>{voucher.voucher_number}</h2><p>Created {date(voucher.created_at)}</p></div><button className="icon-button" onClick={onClose}>×</button></div>
    <div className="detail-title-row"><div><span className="detail-category">{voucher.category || "General expense"}</span><h3>{voucher.title}</h3></div><StatusBadge status={voucher.status} /></div>
    <div className="detail-amount">{money(voucher.amount)}<small>Expense amount</small></div>
    <div className="detail-grid"><DetailItem label="Employee" value={voucher.employee_name} /><DetailItem label="Employee ID" value={voucher.employee_code || "—"} /><DetailItem label="Department" value={voucher.department} /><DetailItem label="Expense date" value={date(voucher.expense_date)} /><DetailItem label="Voucher date" value={date(voucher.voucher_date)} /><DetailItem label="Last updated" value={date(voucher.updated_at)} /></div>
    {voucher.description && <div className="description-block"><span>DESCRIPTION</span><p>{voucher.description}</p></div>}
    <div className="detail-signatures"><Signature label="Employee signature" src={voucher.employee_signature} token={token} /><Signature label="Director signature" src={voucher.director_signature} token={token} /></div>
    {voucher.approval_date && <div className="approved-note"><CheckIcon /> Approved on {date(voucher.approval_date)}</div>}
    {voucher.rejection_reason && <div className="rejection-note"><strong>Reason for rejection</strong><p>{voucher.rejection_reason}</p></div>}
    {canReview && <div className="review-panel"><h3>Review this voucher</h3><p>Confirm the expense details before you make a decision.</p><label>Director signature <small>Required to approve</small><div className="review-signature"><label className="upload-button">{uploading ? "Uploading…" : signature ? "Change image" : "Upload signature"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => upload(e.target.files?.[0])} /></label><ProtectedImage src={signature} token={token} alt="Director signature preview" /></div></label><label>Rejection reason <small>Required to reject</small><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows="2" placeholder="Explain what needs to be changed…" /></label></div>}
    {error && <div className="form-error">{error}</div>}
    <div className="modal-actions">{canReview ? <><button className="button reject-button" disabled={busy} onClick={() => decision("reject")}><CloseIcon /> Reject</button><button className="button primary" disabled={busy || uploading} onClick={() => decision("approve")}><CheckIcon /> {busy ? "Saving…" : "Approve voucher"}</button></> : <button className="button secondary" onClick={onClose}>Close</button>}</div>
  </section></div>;
}

function DetailItem({ label, value }) { return <div className="detail-item"><span>{label}</span><strong>{value || "—"}</strong></div>; }
function Signature({ label, src, token }) { return <div className="signature-box"><span>{label}</span>{src ? <ProtectedImage src={src} token={token} alt={label} /> : <div className="signature-empty">Not provided</div>}</div>; }
function ProtectedImage({ src, token, alt }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!src) { setObjectUrl(""); setFailed(false); return undefined; }
    let active = true;
    let url;
    setObjectUrl("");
    setFailed(false);
    fetch(src, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error("Signature image could not be loaded.");
        return response.blob();
      })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) setObjectUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [src, token]);
  if (!src) return null;
  if (failed) return <span className="signature-unavailable">Signature unavailable</span>;
  if (!objectUrl) return <span className="signature-loading">Loading signature…</span>;
  return <img src={objectUrl} alt={alt} />;
}
function StatusBadge({ status }) { const labels = { draft: "Draft", pending: "Pending", approved: "Approved", rejected: "Rejected" }; return <span className={`status-badge ${status}`}><span />{labels[status] || status}</span>; }
function EmptyState({ title, text }) { return <div className="empty-state"><span className="empty-icon"><ReceiptIcon /></span><strong>{title}</strong><p>{text}</p></div>; }
function ErrorState({ message }) { return <div className="inline-error">{message}</div>; }
function Loading() { return <div className="loading"><span /> Loading your workspace…</div>; }
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; }

function BrandIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="M5 5.5h9.5a4.5 4.5 0 0 1 0 9H10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/><path d="M10 10.5h4.5a4 4 0 0 1 0 8H5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/><path d="M5 5.5v13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>; }
function GridIcon() { return <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>; }
function ReceiptIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>; }
function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="m5 12.5 4.5 4.5L19 7"/></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="m7 7 10 10M17 7 7 17"/></svg>; }
function WalletIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="M4 6.5h15a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-14A2.5 2.5 0 0 1 2.5 17V6a2.5 2.5 0 0 1 2.5-2.5h13"/><path d="M20.5 11h-5a2 2 0 0 0 0 4h5M16 13h.01"/></svg>; }
function EditIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="m14 5 5 5M4 20l4.4-.9L19 7.5a2.1 2.1 0 0 0-3-3L5.4 15.1 4 20Z"/></svg>; }
function CalendarIcon() { return <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17"/></svg>; }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4 4"/></svg>; }
function FilterIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M7 12h10M10 18h4"/></svg>; }
function SendIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="m21 3-7.5 18-3.8-7.7L2 9.5 21 3Z"/><path d="M9.7 13.3 21 3"/></svg>; }
function TrashIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/></svg>; }
function ChevronIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6"/></svg>; }
function ShieldIcon() { return <svg viewBox="0 0 24 24" fill="none"><path d="M12 3 20 6v5.5c0 4.5-3.4 7.8-8 9.5-4.6-1.7-8-5-8-9.5V6l8-3Z"/><path d="m9 12 2 2 4-4"/></svg>; }

export default App;
