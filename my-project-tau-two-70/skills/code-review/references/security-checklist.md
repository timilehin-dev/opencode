# OWASP-Aligned Security Review Checklist

> Use this checklist during every code review to identify security vulnerabilities.
> Aligned with OWASP Top 10 (2021) and OWASP API Security Top 10.

---

## 1. Input Validation

### 1.1 SQL Injection

**What to check:**
- User-supplied input used directly in SQL queries without parameterization.
- Dynamic query construction via string concatenation or template literals.

**How to check it:**
- Search for string concatenation inside query builders (e.g., `query + userInput`).
- Look for raw SQL execution functions (`query()`, `raw()`, `execute()`).
- Use static analysis tools (eslint-plugin-security, semgrep).

**Common vulnerable patterns:**
```typescript
// VULNERABLE: string concatenation
const query = `SELECT * FROM users WHERE email = '${req.body.email}'`;
db.query(query);

// VULNERABLE: template literal interpolation
const result = await knex.raw(`SELECT * FROM products WHERE id = ${productId}`);
```

**Recommended fix:**
```typescript
// FIX: parameterized queries
const query = "SELECT * FROM users WHERE email = ?";
db.query(query, [req.body.email]);

// FIX: query builder with parameter binding
const result = await knex("products").where({ id: productId });

// FIX: ORM with built-in escaping
const user = await User.findOne({ where: { email: req.body.email } });
```

---

### 1.2 Cross-Site Scripting (XSS)

**What to check:**
- Untrusted data rendered in HTML without escaping.
- Use of `dangerouslySetInnerHTML` (React) or `v-html` (Vue).
- DOM manipulation via `innerHTML`, `document.write`, or `outerHTML`.
- URL parameters reflected in responses without encoding.

**How to check it:**
- Search for `dangerouslySetInnerHTML`, `v-html`, `innerHTML`, `document.write`.
- Trace user input from source to render/sink.
- Run DOMPurify or similar sanitizer validation.

**Common vulnerable patterns:**
```typescript
// VULNERABLE: dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// VULNERABLE: innerHTML assignment
document.getElementById("output").innerHTML = comment;

// VULNERABLE: URL reflected in response
res.send(`<p>Hello, ${req.query.name}</p>`);
```

**Recommended fix:**
```typescript
// FIX: React auto-escapes by default — just use JSX
<div>{userInput}</div>

// FIX: sanitize before using dangerouslySetInnerHTML
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />

// FIX: use textContent instead of innerHTML
document.getElementById("output").textContent = comment;

// FIX: encode before reflecting in templates
const encoded = encodeURI(req.query.name);
res.send(`<p>Hello, ${escapeHtml(encoded)}</p>`);
```

---

### 1.3 Command Injection

**What to check:**
- User input passed to `child_process.exec()`, `execSync()`, or `spawn()` with `shell: true`.
- Command-line arguments built via string concatenation.

**How to check it:**
- Search for `exec`, `execSync`, `spawn`, `execFile` imports.
- Flag any usage of `shell: true` with user-controlled input.

**Common vulnerable patterns:**
```typescript
// VULNERABLE: exec with string concatenation
const { exec } = require("child_process");
exec(`convert ${filename} output.png`);

// VULNERABLE: execSync with template literal
const result = execSync(`ping -c 1 ${userProvidedHost}`);
```

**Recommended fix:**
```typescript
// FIX: use execFile with argument array (no shell interpolation)
const { execFile } = require("child_process");
execFile("convert", [filename, "output.png"]);

// FIX: validate input against an allowlist
const ALLOWED_HOSTS = /^[a-zA-Z0-9.\-]+$/;
if (!ALLOWED_HOSTS.test(userProvidedHost)) {
  throw new Error("Invalid host");
}
execFile("ping", ["-c", "1", userProvidedHost]);

// FIX: use spawn with explicit arguments (no shell option)
import { spawn } from "child_process";
spawn("convert", [filename, "output.png"], { shell: false });
```

---

### 1.4 Path Traversal

**What to check:**
- User input used to construct file paths (`fs.readFile`, `fs.writeFile`, `path.join`).
- Missing validation that resolved paths stay within intended directories.

**How to check it:**
- Search for `fs.readFile`, `fs.writeFile`, `fs.unlink`, `path.join` with variables.
- Verify path resolution is checked against a base directory.

**Common vulnerable patterns:**
```typescript
// VULNERABLE: no path containment check
const filePath = path.join(UPLOAD_DIR, req.params.filename);
res.sendFile(filePath);

// VULNERABLE: user controls directory segment
const file = `/var/data/${req.query.folder}/${req.query.file}`;
fs.readFileSync(file);
```

**Recommended fix:**
```typescript
// FIX: resolve and validate against base directory
import path from "path";

function safeFilePath(baseDir: string, userInput: string): string {
  const resolved = path.resolve(baseDir, userInput);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

const filePath = safeFilePath(UPLOAD_DIR, req.params.filename);
res.sendFile(filePath);
```

---

### 1.5 Server-Side Request Forgery (SSRF)

**What to check:**
- User input used as a URL for server-side HTTP requests (`fetch`, `axios`, `http.get`).
- No allowlist/blocklist for outbound URLs.
- Requests to internal IP ranges (127.0.0.1, 10.x.x.x, 169.254.169.254, etc.).

**How to check it:**
- Search for `fetch(`, `axios.get(`, `http.request(` with user-controlled URLs.
- Check for URL validation/sanitization logic.

**Common vulnerable patterns:**
```typescript
// VULNERABLE: user-controlled URL with no validation
app.get("/proxy", async (req, res) => {
  const data = await fetch(req.query.url);
  return res.json(await data.json());
});
```

**Recommended fix:**
```typescript
// FIX: validate URL against an allowlist
import { URL } from "url";

const ALLOWED_HOSTS = new Set(["api.example.com", "cdn.example.com"]);
const BLOCKED_RANGES = ["127.0.0.0/8", "10.0.0.0/8", "169.254.0.0/16"];

app.get("/proxy", async (req, res) => {
  const parsed = new URL(req.query.url);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(403).json({ error: "Host not allowed" });
  }
  const data = await fetch(req.query.url);
  return res.json(await data.json());
});
```

---

### 1.6 LDAP Injection

**What to check:**
- User input concatenated into LDAP search filters.
- Missing escaping of LDAP special characters (`*`, `(`, `)`, `\`, `NUL`).

**Common vulnerable patterns:**
```typescript
// VULNERABLE: raw user input in LDAP filter
const filter = `(uid=${username})`;
ldapClient.search("dc=example,dc=com", { filter });
```

**Recommended fix:**
```typescript
// FIX: escape LDAP special characters
function escapeLDAP(input: string): string {
  return input.replace(/[\*\(\)\\NUL]/g, (ch) => `\\${ch.charCodeAt(0).toString(16)}`);
}
const filter = `(uid=${escapeLDAP(username)})`;
```

---

## 2. Authentication & Authorization

### 2.1 Broken Authentication

**What to check:**
- Credentials transmitted over HTTP instead of HTTPS.
- Weak password policies (no minimum length, no complexity).
- Missing account lockout after failed attempts.
- Plaintext password storage.

**Recommended fix:**
```typescript
// FIX: strong password hashing with bcrypt
import bcrypt from "bcrypt";
const SALT_ROUNDS = 12;

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// FIX: rate limiting on login
import rateLimit from "express-rate-limit";
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: "Too many login attempts. Try again later.",
});
app.post("/login", loginLimiter, loginHandler);
```

---

### 2.2 Session Management

**What to check:**
- Session IDs predictable or generated with weak entropy.
- Sessions not invalidated on logout or password change.
- Missing `httpOnly`, `secure`, `sameSite` cookie flags.
- Session tokens in URLs.

**Recommended fix:**
```typescript
// FIX: secure cookie configuration
app.use(session({
  secret: process.env.SESSION_SECRET, // from env, not hardcoded
  cookie: {
    httpOnly: true,
    secure: true,     // HTTPS only
    sameSite: "strict",
    maxAge: 3600000,  // 1 hour
  },
  rolling: true,
  resave: false,
  saveUninitialized: false,
}));

// FIX: invalidate session on logout
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sessionId", { path: "/" });
    res.status(204).end();
  });
});
```

---

### 2.3 Insecure Direct Object Reference (IDOR)

**What to check:**
- Resources accessed by sequential/predictable IDs without ownership checks.
- API endpoints accepting object IDs with no authorization logic.

**Common vulnerable patterns:**
```typescript
// VULNERABLE: no ownership check
app.get("/api/orders/:id", async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order); // any user can access any order
});
```

**Recommended fix:**
```typescript
// FIX: verify resource ownership
app.get("/api/orders/:id", authenticate, async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.id,
    userId: req.user.id, // ownership check
  });
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json(order);
});
```

---

### 2.4 Privilege Escalation

**What to check:**
- Role checks missing on admin-only endpoints.
- User role stored client-side (cookies, localStorage) without server verification.
- Mass-assignment allowing role field updates.

**Recommended fix:**
```typescript
// FIX: server-side role enforcement
function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

app.delete("/api/users/:id", authenticate, requireRole("admin"), deleteUser);

// FIX: prevent mass assignment — explicit allowlist
function updateUser(req: Request, res: Response) {
  const ALLOWED_FIELDS = ["name", "email", "bio"];
  const updates: Record<string, string> = {};
  for (const field of ALLOWED_FIELDS) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }
  // `role` from req.body is silently ignored
  User.findByIdAndUpdate(req.params.id, updates);
}
```

---

### 2.5 MFA Bypass

**What to check:**
- MFA verification can be skipped via missing or tamperable parameters.
- Backup codes have no rate limiting.
- MFA secret stored in plaintext.

**Recommended fix:**
```typescript
// FIX: enforce MFA as mandatory step in auth flow
app.post("/login/verify-mfa", loginLimiter, async (req, res) => {
  const { userId, totpCode } = req.body;

  // Server-side MFA state (not from client)
  const mfaSession = await getMFASession(userId);
  if (!mfaSession || mfaSession.verified) {
    return res.status(400).json({ error: "Invalid MFA session" });
  }

  const isValid = verifyTOTP(mfaSession.secret, totpCode);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid code" });
  }

  await markSessionVerified(userId);
  const token = generateJWT(userId);
  res.json({ token });
});
```

---

## 3. Data Protection

### 3.1 Sensitive Data Exposure

**What to check:**
- Secrets, API keys, tokens in source code or configuration files.
- PII (emails, SSNs, phone numbers) logged or returned in error messages.
- Stack traces exposed to end users.

**Recommended fix:**
```typescript
// FIX: use environment variables, never hardcode secrets
// .env file (gitignored):
//   DATABASE_URL=postgresql://user:pass@host/db
//   STRIPE_SECRET_KEY=sk_live_xxx

import dotenv from "dotenv";
dotenv.config();

const dbUrl = process.env.DATABASE_URL; // loaded from env
const stripeKey = process.env.STRIPE_SECRET_KEY;

// FIX: sanitize logs — never log sensitive fields
function sanitizeLog(obj: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE = new Set(["password", "token", "ssn", "creditCard"]);
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    sanitized[key] = SENSITIVE.has(key) ? "[REDACTED]" : val;
  }
  return sanitized;
}
console.log("User update:", sanitizeLog(req.body));
```

---

### 3.2 Insecure Storage

**What to check:**
- Passwords hashed with MD5 or SHA-1 instead of bcrypt/argon2.
- Encryption keys stored alongside encrypted data.
- Database backups unencrypted.

**Recommended fix:**
```typescript
// FIX: use argon2id for password hashing
import argon2 from "argon2";

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

---

### 3.3 Missing Encryption in Transit

**What to check:**
- Internal service communication over plain HTTP.
- Missing TLS configuration on API endpoints.
- WebSocket connections without `wss://`.

**Recommended fix:**
```typescript
// FIX: enforce HTTPS in Express
import helmet from "helmet";
app.use(helmet()); // sets HSTS, CSP, and other security headers

// FIX: redirect HTTP to HTTPS (in production)
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}
```

---

### 3.4 PII Leakage

**What to check:**
- PII fields returned in API responses that do not need them.
- User data exported/stored without anonymization.
- Search endpoints returning user records with full details.

**Recommended fix:**
```typescript
// FIX: exclude sensitive fields from API responses
// Using toJSON method
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.ssn;
  delete obj.creditCard;
  delete obj.__v;
  return obj;
};

// FIX: explicit field selection in queries
const users = await User.find({})
  .select("name email role createdAt") // explicit allowlist
  .lean();
```

---

## 4. API Security

### 4.1 Rate Limiting

**What to check:**
- No rate limiting on authentication endpoints.
- No rate limiting on resource-intensive endpoints (search, export, file upload).
- Global rate limit too permissive.

**Recommended fix:**
```typescript
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";

// Per-endpoint limits
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
});

app.use("/api/", apiLimiter);
app.post("/api/login", authLimiter, loginHandler);
app.post("/api/register", authLimiter, registerHandler);
```

---

### 4.2 Input Size Limits

**What to check:**
- No limits on request body size.
- No limits on file upload size.
- No limits on query string or header length.

**Recommended fix:**
```typescript
import express from "express";

// FIX: limit request body size globally
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ limit: "100kb", extended: false }));

// FIX: limit file uploads with multer
import multer from "multer";
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
    fields: 10,
  },
  fileFilter: (req, file, cb) => {
    const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];
    cb(null, ALLOWED.includes(file.mimetype));
  },
});
```

---

### 4.3 CORS Configuration

**What to check:**
- CORS set to `*` in production.
- Specific origins not enforced.
- Credentials allowed with wildcard origins.

**Recommended fix:**
```typescript
import cors from "cors";

// FIX: explicit allowlist
const ALLOWED_ORIGINS = [
  "https://app.example.com",
  "https://admin.example.com",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}));
```

---

### 4.4 Security Headers

**What to check:**
- Missing Content-Security-Policy (CSP).
- Missing Strict-Transport-Security (HSTS).
- Missing X-Content-Type-Options, X-Frame-Options.
- Missing Referrer-Policy.

**Recommended fix:**
```typescript
// FIX: use helmet for comprehensive security headers
import helmet from "helmet";

app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://cdn.example.com"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https://images.example.com"],
    connectSrc: ["'self'", "https://api.example.com"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
  },
}));

app.use(helmet.hsts({
  maxAge: 31536000,     // 1 year
  includeSubDomains: true,
  preload: true,
}));
```

---

## 5. Dependency Security

### 5.1 Known CVEs

**What to check:**
- Outdated packages with published vulnerabilities.
- Transitive dependencies with known issues.

**How to check it:**
```bash
# npm audit
npm audit --production

# pnpm audit
pnpm audit

# Use Snyk or Dependabot for continuous monitoring
npx snyk test
```

**Recommended fix:**
```bash
# Auto-fix vulnerable dependencies
npm audit fix

# For breaking changes, review manually
npm audit fix --force  # use with caution

# Lock dependency versions in package.json
# "express": "4.18.3"  (not "^4.18.3")
```

---

### 5.2 Outdated Packages

**What to check:**
- Packages many major versions behind.
- No automated dependency update workflow.

**Recommended fix:**
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

### 5.3 Supply Chain Risks

**What to check:**
- Packages with typosquatting names.
- Packages with very few downloads or no maintainer activity.
- Git submodules or external scripts executed during install.

**Recommended fix:**
```bash
# Check package reputation
npm info <package-name> time downloads maintainers

# Use npm ci (strict) instead of npm install
npm ci

# Pin exact versions in lockfile
# Review lockfile changes in PRs

# Use .npmrc to restrict scopes
# .npmrc
# audit=true
# fund=false
# save-exact=true
```

---

## 6. Infrastructure Security

### 6.1 Secrets in Code

**What to check:**
- Hardcoded API keys, passwords, tokens in source code.
- Secrets committed to Git history.

**How to check it:**
```bash
# Use gitleaks to scan repository history
gitleaks detect --source . --verbose

# Use truffleHog for comprehensive secret scanning
trufflehog git file://. --only-verified
```

**Recommended fix:**
```typescript
// BAD: hardcoded secret
const API_KEY = "sk_live_abc123def456";

// GOOD: load from environment
const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("API_KEY environment variable is required");
```

---

### 6.2 Debug Mode in Production

**What to check:**
- `NODE_ENV` not set to `"production"`.
- Debug endpoints (`/debug`, `/status`, `/env`) exposed.
- Verbose error messages returned to clients.

**Recommended fix:**
```typescript
// FIX: assert environment variable
if (process.env.NODE_ENV !== "production") {
  console.warn("WARNING: Running in non-production mode");
}

// FIX: global error handler — hide details in production
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const isDev = process.env.NODE_ENV !== "production";
  res.status(500).json({
    error: isDev ? err.message : "Internal server error",
    ...(isDev && { stack: err.stack }),
  });
});

// FIX: remove debug endpoints in production
if (process.env.NODE_ENV !== "production") {
  app.get("/debug", debugHandler);
}
```

---

### 6.3 Verbose Errors

**What to check:**
- Stack traces, SQL errors, or file paths leaked in API responses.
- Error messages that reveal system internals.

**Recommended fix:**
```typescript
// FIX: structured error handling
class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
  ) {
    super(message);
  }
}

// Use operational errors (safe to show) vs. programming errors (hide)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  // Unknown error — log internally, send generic message
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});
```

---

## Quick-Reference Summary

| Category | Critical Checks | Tools |
|---|---|---|
| Input Validation | Parameterized queries, output encoding, input allowlists | Semgrep, ESLint security plugin |
| Auth & Authz | Session flags, ownership checks, role middleware | OWASP ZAP, custom tests |
| Data Protection | Env vars, password hashing, PII exclusion | gitleaks, truffleHog |
| API Security | Rate limits, CORS allowlist, security headers | helmet, rate-limit |
| Dependencies | `npm audit`, Dependabot, lockfile reviews | Snyk, Socket.dev |
| Infrastructure | No secrets in code, debug mode off, safe errors | gitleaks, env validation |
