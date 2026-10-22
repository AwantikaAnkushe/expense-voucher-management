
# ExpenseFlow — Expense Voucher Management

ExpenseFlow is a full-stack application for creating, submitting, reviewing, and tracking employee expense vouchers. It uses React and Vite for the web interface, Express for the REST API, and SQLite for application data.

Deployed on render - https://expense-voucher-management.onrender.com/

## Features

- JWT-based sign-in and role-based access for Employees, Directors, and Accounts.
- Employees can create, edit, delete, and submit draft vouchers.
- Directors can review, approve with a signature, or reject with a reason.
- Accounts can view organization-wide vouchers, their statuses, and linked signatures.
- Voucher search, status/date/amount filters, and sorting.
- Server-generated voucher numbers and role-specific dashboard summaries.
- PNG, JPEG, and WebP signature uploads, limited to 2 MB, served through authenticated routes.

## Requirements

- Node.js 20 or later
- npm

## Local setup

From the repository root, install dependencies:

```sh
npm install
```

Copy `.env.example` to `.env` and set a private `JWT_SECRET` for your environment. The example values are for local development only.

Start the frontend and API:

```sh
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://localhost:4000>
- Health check: <http://localhost:4000/api/health>

The Vite development server proxies `/api` requests to Express.

For a production-style local run, build the frontend and start Express:

```sh
npm run build
npm start
```

Then open <http://localhost:4000>.

## Demo accounts

The application seeds these accounts when it starts:

| Role | Email | Password |
| --- | --- | --- |
| Employee | `employee@abc.com` | `Employee123!` |
| Director | `director@abc.com` | `Director123!` |
| Accounts | `accounts@abc.com` | `Accounts123!` |

These fixed demo credentials are intended only for evaluation. Do not use them for a public production service or with real employee or financial data.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Express port; defaults to `4000`. Hosting platforms commonly provide this automatically. |
| `NODE_ENV` | No | Set to `production` for production. A non-default `JWT_SECRET` is required in production. |
| `JWT_SECRET` | Yes for production | Private signing key used for JWT sessions. Never commit the real value. |
| `CLIENT_ORIGIN` | No | Allowed browser origin for API CORS; defaults to `http://localhost:5173`. |
| `DATA_DIR` | No | Directory for `expenses.sqlite`; defaults to `server/data`. |
| `UPLOADS_DIR` | No | Directory for uploaded signatures; defaults to `server/uploads`. |

See `.env.example` for local-development placeholders.

## Database schema

The SQLite database is initialized automatically by `server/db.js` using `sql.js` (SQLite compiled to WebAssembly). The database file is exported to `DATA_DIR/expenses.sqlite` after changes.

### `users`

| Column | Description |
| --- | --- |
| `id` | Integer primary key. |
| `name`, `email` | User's display name and unique sign-in email. |
| `password_hash` | bcrypt hash of the seeded account password. |
| `role` | `employee`, `director`, or `accounts`. |
| `department`, `employee_id` | User's department and employee identifier. |

### `vouchers`

| Column | Description |
| --- | --- |
| `id` | Integer primary key. |
| `voucher_number` | Unique, server-generated voucher number. |
| `voucher_date`, `expense_date` | Voucher creation date and expense date. |
| `department`, `title`, `category`, `description`, `amount` | Expense details. Amount must be greater than zero. |
| `employee_id` | Foreign key to the creating user. |
| `employee_signature` | Authenticated signature-image URL; required before submission. |
| `status` | `draft`, `pending`, `approved`, or `rejected`. |
| `director_signature`, `approval_date` | Director signature-image URL and approval timestamp. |
| `rejection_reason` | Required when a Director rejects a voucher. |
| `created_at`, `updated_at` | Audit timestamps. |

### `signature_files`

| Column | Description |
| --- | --- |
| `filename` | Unique stored image filename. |
| `uploader_id` | Foreign key to the uploading user. |
| `created_at` | Upload timestamp. |

The database schema and initial demo-user seed are created on server startup; no separate migration command is currently required.

## API documentation

All routes are under `/api`. Except for login and the health check, send the JWT in the request header:

```http
Authorization: Bearer <token>
```

Voucher and dashboard responses are JSON. Request bodies use JSON except signature uploads, which use `multipart/form-data` with a `signature` file field.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Public | Sign in with `{ "email": "...", "password": "..." }`; returns `{ token, user }`. |
| `GET` | `/api/auth/me` | Any signed-in user | Get the current token's user information. |
| `GET` | `/api/health` | Public | Health check. |
| `POST` | `/api/uploads/signature` | Employee or Director | Upload one PNG, JPEG, or WebP signature image (maximum 2 MB); returns its authenticated URL. |
| `GET` | `/api/signatures/:filename` | Signed-in user with voucher access | Fetch a signature image the user is allowed to view. |
| `GET` | `/api/dashboard` | Any signed-in user | Get role-specific dashboard counts, amounts, and recent activity. |
| `GET` | `/api/vouchers` | Any signed-in user | List vouchers; employees receive only their own. Supports `q`, `status`, `from`, `to`, `minAmount`, `maxAmount`, `sort`, and `direction` query parameters. |
| `POST` | `/api/vouchers` | Employee | Create a draft voucher. |
| `GET` | `/api/vouchers/:id` | Signed-in user with voucher access | Get voucher details. |
| `PUT` | `/api/vouchers/:id` | Owning Employee, draft only | Update a draft voucher. |
| `DELETE` | `/api/vouchers/:id` | Owning Employee, draft only | Delete a draft voucher. |
| `POST` | `/api/vouchers/:id/submit` | Owning Employee, draft only | Submit a voucher; an employee signature is required. |
| `POST` | `/api/vouchers/:id/approve` | Director, pending only | Approve with `{ "director_signature": "<uploaded URL>" }`. |
| `POST` | `/api/vouchers/:id/reject` | Director, pending only | Reject with `{ "reason": "..." }`; a reason is required. |

Example combined filters:

```text
/api/vouchers?status=approved&from=2026-01-01&to=2026-12-31&minAmount=10&maxAmount=500&sort=amount&direction=desc
```

The `q` search matches voucher number, employee name, department, title, and category. `sort` accepts `date` or `amount`; `direction` accepts `asc` or `desc`.

Role restrictions, employee voucher ownership, draft-only editing and deletion, and workflow validation are enforced by the API as well as the interface.

## Workflow and assumptions

- New vouchers start as `draft` and receive a unique voucher number from the server.
- In this implementation, `pending` represents both “submitted” and “pending approval”; these are not separate persisted statuses.
- Submitting requires the employee signature and valid required expense fields. Approving requires the Director signature. Rejecting requires a reason.
- Only the employee who created a draft may edit or delete it. Submitted vouchers are read-only to employees.
- Directors and Accounts can view organization-wide vouchers. Only Directors can approve or reject.
- Accounts can monitor approved expenses and signatures; a separate payment-processing or “paid” status is outside the current scope.
- The currency shown by the interface is USD.
- Users are seeded demo accounts. User registration, password reset, and administrative user management are not implemented.
- Date-range filtering uses the voucher's `expense_date`.
- Signature uploads are stored on the server filesystem and delivered only through an authenticated endpoint.

## Deployment

This is a full-stack Node.js app. GitHub Pages alone cannot host its Express API, SQLite database, or uploads. Deploy the repository to a Node.js web-service host such as Render.

Use these commands in the service settings:

- **Build command:** `npm install --include=dev && npm run build`
- **Start command:** `npm start`

Set these environment variables on the hosting service:

- `NODE_ENV=production`
- `JWT_SECRET` set to a strong, private value

For persistent vouchers and signature files, attach persistent storage and set `DATA_DIR` and `UPLOADS_DIR` to directories on that storage. For example, if the host mounts a disk at `/var/data`, set:

- `DATA_DIR=/var/data`
- `UPLOADS_DIR=/var/data/uploads`

Without persistent storage, local files may be lost on restart or redeployment. Check your hosting provider's pricing and disk availability.

Before using this app with real business data, replace the demo authentication and account setup with an appropriate production identity and security model, and review hosting, data-retention, backup, and privacy requirements.
````
