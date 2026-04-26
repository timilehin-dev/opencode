# Code Quality Metrics Guide

> Comprehensive reference for measuring, interpreting, and acting on code quality metrics during review.

---

## 1. Cyclomatic Complexity

### What It Measures

Cyclomatic complexity (McCabe complexity) counts the number of **linearly independent paths** through a function's control flow graph. Each decision point (if, else if, switch case, ternary, &&, ||, for, while, catch) adds +1 to the complexity.

### How to Calculate

```
M = E − N + 2P
```

Where:
- **E** = number of edges in the control flow graph
- **N** = number of nodes
- **P** = number of connected components (usually 1 for a single function)

In practice, you can count decision points:

```typescript
function calculateDiscount(order: Order): number {         // base = 1
  let discount = 0;                                        //

  if (order.total > 100) {                                // +1 = 2
    discount += 5;
  } else if (order.isPremium) {                           // +1 = 3
    discount += 10;
  }

  for (const item of order.items) {                       // +1 = 4
    if (item.category === "electronics" && item.qty > 2) { // +1 = 5
      discount += item.qty * 2;
    }
  }

  return discount > 50 ? 50 : discount;                   // +1 = 6
}
// Cyclomatic complexity = 6
```

**Counting rules:**

| Construct | Increment |
|---|---|
| `if`, `else if` | +1 each |
| `else` | 0 (part of the `if`) |
| `case` in `switch` | +1 each |
| `for`, `for...in`, `for...of` | +1 each |
| `while`, `do...while` | +1 each |
| `catch` | +1 each |
| `&&`, `\|\|` (short-circuit) | +1 each |
| `??` (nullish coalescing) | +1 each |
| Ternary `a ? b : c` | +1 |
| Default (function entry) | +1 (base) |

### Thresholds

| Range | Rating | Action |
|---|---|---|
| 1–10 | **Good** | Acceptable. No action needed. |
| 11–20 | **Warning** | Flag in review. Consider extracting helper functions or simplifying logic. |
| 21+ | **Critical** | Must refactor. Break into smaller functions, use polymorphism or strategy pattern. |

**Note:** Complex validation logic, state machines, and protocol handlers may legitimately exceed 10. Use judgment — flag only when complexity isn't justified.

### Practical Refactoring Example

```typescript
// BEFORE: complexity = 15 (too high)
function processOrder(order: Order): Result {
  if (!order.items.length) return { status: "error", code: "EMPTY" };
  if (order.total <= 0) return { status: "error", code: "INVALID_TOTAL" };
  if (!order.shippingAddress) return { status: "error", code: "NO_ADDRESS" };
  if (order.customerId && !isValidCustomer(order.customerId)) {
    return { status: "error", code: "INVALID_CUSTOMER" };
  }
  if (order.items.some(i => !i.productId)) {
    return { status: "error", code: "MISSING_PRODUCT" };
  }
  if (order.items.some(i => i.qty <= 0)) {
    return { status: "error", code: "INVALID_QTY" };
  }
  if (order.couponCode) {
    const coupon = findCoupon(order.couponCode);
    if (!coupon) return { status: "error", code: "INVALID_COUPON" };
    if (coupon.used) return { status: "error", code: "USED_COUPON" };
    if (coupon.expiresAt < new Date()) return { status: "error", code: "EXPIRED_COUPON" };
    order.discount = coupon.amount;
  }
  const tax = order.total * 0.08;
  const shipping = order.total > 50 ? 0 : 9.99;
  order.finalTotal = order.total - (order.discount || 0) + tax + shipping;
  await saveOrder(order);
  return { status: "success", order };
}

// AFTER: extracted into focused functions, each with low complexity
function validateOrder(order: Order): ValidationResult {
  const checks = [
    [!order.items.length, "EMPTY"],
    [order.total <= 0, "INVALID_TOTAL"],
    [!order.shippingAddress, "NO_ADDRESS"],
    [order.items.some(i => !i.productId), "MISSING_PRODUCT"],
    [order.items.some(i => i.qty <= 0), "INVALID_QTY"],
  ] as const;

  for (const [condition, code] of checks) {
    if (condition) return { valid: false, code };
  }

  return { valid: true };
} // complexity ≈ 3

function applyCoupon(order: Order, code: string): string | null {
  const coupon = findCoupon(code);
  if (!coupon) return "INVALID_COUPON";
  if (coupon.used) return "USED_COUPON";
  if (coupon.expiresAt < new Date()) return "EXPIRED_COUPON";
  order.discount = coupon.amount;
  return null;
} // complexity ≈ 4

function calculateTotals(order: Order) {
  const tax = order.total * 0.08;
  const shipping = order.total > 50 ? 0 : 9.99;
  order.finalTotal = order.total - (order.discount || 0) + tax + shipping;
} // complexity ≈ 2

async function processOrder(order: Order): Promise<Result> {
  const validation = validateOrder(order);
  if (!validation.valid) return { status: "error", code: validation.code };

  if (order.couponCode) {
    const couponError = applyCoupon(order, order.couponCode);
    if (couponError) return { status: "error", code: couponError };
  }

  calculateTotals(order);
  await saveOrder(order);
  return { status: "success", order };
} // complexity ≈ 4
```

### Tools

| Tool | Language | Integration |
|---|---|---|
| ESLint `complexity` rule | JS/TS | Inline in IDE/CI |
| `lizard` | Multi-language | CLI, CI pipeline |
| `sonarqube` | Multi-language | Self-hosted scanner |
| `codeclimate` | Multi-language | SaaS + CI |
| TypeScript compiler | TS | `--noUnusedLocals`, etc. |

---

## 2. Lines of Code per Function

### Thresholds and Rationale

| Range | Rating | Rationale |
|---|---|---|
| 1–20 | **Good** | Function does one thing, easy to understand. |
| 21–40 | **Acceptable** | May need scanning, but generally okay for complex logic. |
| 41–60 | **Warning** | Likely doing multiple things. Consider splitting. |
| 60+ | **Critical** | Too long. Definitely refactor. |

**Why it matters:**
- Functions >40 lines correlate strongly with higher bug density.
- Long functions resist reuse and are harder to test.
- Cognitive load increases — reviewers can't hold the logic in working memory.

### Practical Guidance

Lines of code is a **proxy** metric. A 35-line function with straightforward logic is better than a 15-line function with dense nested conditionals. Use in combination with cyclomatic complexity.

```typescript
// WARNING: 65 lines, does too many things
async function handleUserRegistration(req: Request, res: Response) {
  const { name, email, password, confirmPassword, referralCode } = req.body;

  // Validation (20 lines)
  if (!name || name.length < 2) return res.status(400).json({ error: "Name too short" });
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });
  if (password.length < 8) return res.status(400).json({ error: "Password too short" });
  if (password !== confirmPassword) return res.status(400).json({ error: "Passwords mismatch" });
  // ...more validation...

  // Duplicate check (5 lines)
  const existing = await User.findOne({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already registered" });

  // Referral logic (10 lines)
  let referrer = null;
  if (referralCode) {
    referrer = await User.findOne({ where: { referralCode } });
    if (!referrer) return res.status(400).json({ error: "Invalid referral code" });
  }

  // Create user (15 lines)
  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, password: hashedPassword });

  // Send email (10 lines)
  await sendVerificationEmail(user.email, user.verificationToken);

  // Response (5 lines)
  return res.status(201).json({ id: user.id, email: user.email });
}

// FIX: split into focused functions (each < 20 lines)
function validateRegistrationInput(body: RegistrationBody): string | null {
  if (!body.name || body.name.length < 2) return "Name too short";
  if (!body.email || !body.email.includes("@")) return "Invalid email";
  if (body.password.length < 8) return "Password too short";
  if (body.password !== body.confirmPassword) return "Passwords mismatch";
  return null;
}

async function checkDuplicateEmail(email: string): Promise<void> {
  const existing = await User.findOne({ where: { email } });
  if (existing) throw new ConflictError("Email already registered");
}

async function resolveReferral(code: string | undefined): Promise<User | null> {
  if (!code) return null;
  const referrer = await User.findOne({ where: { referralCode: code } });
  if (!referrer) throw new BadRequestError("Invalid referral code");
  return referrer;
}

async function handleUserRegistration(req: Request, res: Response) {
  const error = validateRegistrationInput(req.body);
  if (error) return res.status(400).json({ error });

  await checkDuplicateEmail(req.body.email);
  await resolveReferral(req.body.referralCode);

  const hashedPassword = await bcrypt.hash(req.body.password, 12);
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: hashedPassword,
  });

  await sendVerificationEmail(user.email, user.verificationToken);
  return res.status(201).json({ id: user.id, email: user.email });
}
```

---

## 3. Coupling Metrics

### Afferent Coupling (Ca) — Incoming Dependencies

**Definition:** Number of other modules that depend on this module.

```
// module A depends on AuthService
// module B depends on AuthService
// module C depends on AuthService
// → Ca(AuthService) = 3
```

**Interpretation:**
- **High Ca** = module is widely used → high responsibility, harder to change.
- Flag modules with high Ca for extra scrutiny in reviews.
- Should be well-tested and have stable interfaces.

### Efferent Coupling (Ce) — Outgoing Dependencies

**Definition:** Number of other modules this module depends on.

```
// OrderService depends on:
//   - UserService
//   - PaymentService
//   - InventoryService
//   - NotificationService
//   - TaxCalculator
// → Ce(OrderService) = 5
```

**Interpretation:**
- **High Ce** = module depends on many others → fragile to changes in those modules.
- Consider introducing a facade or reducing responsibilities.

### Instability (I)

```
I = Ce / (Ca + Ce)
```

| Value | Meaning |
|---|---|
| I ≈ 1 | Highly unstable — depends on many, depended on by few. Easy to change. |
| I ≈ 0 | Highly stable — depended on by many, depends on few. Hard to change. |
| I ≈ 0.5 | Balanced. |

**Guidance:**
- **Infrastructure/utility code** should have low instability (high Ca, low Ce).
- **Application services** can have higher instability (low Ca, high Ce).
- Flag modules that are both high Ca and high Ce — they are "hubs" and represent coupling risks.

### Practical Example

```typescript
// HIGH Ce (fragile) — depends on 6 modules
class OrderProcessor {
  constructor(
    private userRepo: UserRepository,       // +1
    private paymentService: PaymentService, // +1
    private inventoryClient: InventoryClient, // +1
    private emailService: EmailService,     // +1
    private analytics: AnalyticsService,    // +1
    private logger: Logger,                 // +1
  ) {}                                     // Ce = 6

  async process(order: Order) {
    // Uses all 6 dependencies
  }
}

// FIX: introduce a facade to reduce direct coupling
class OrderProcessor {
  constructor(
    private orderFacade: OrderFacade, // Ce = 1
  ) {}

  async process(order: Order) {
    this.orderFacade.execute(order); // facade internally coordinates
  }
}
```

---

## 4. Code Duplication Detection

### Why Duplication Matters

- Duplicated code multiplies maintenance burden — bugs must be fixed in N places.
- Divergent copies lead to subtle behavioral differences.
- Indicates missing abstraction or shared utility.

### Detection Strategies

**1. Manual Detection (During Review)**
- Look for similar blocks across files.
- Search for repeated string literals, magic numbers, similar function signatures.

```typescript
// DUPLICATED: validation logic in two controllers
// users.controller.ts
if (!req.body.email || !req.body.email.includes("@")) {
  return res.status(400).json({ error: "Invalid email" });
}

// admins.controller.ts
if (!req.body.email || !req.body.email.includes("@")) {
  return res.status(400).json({ error: "Invalid email" });
}
```

**2. Automated Tools**

| Tool | Method | Integration |
|---|---|---|
| `jscpd` | Token-based cloning detection | CLI, CI pipeline |
| `SonarQube` | AST-based duplication analysis | Self-hosted |
| `cpd` (PMD) | Token-based | CI pipeline |
| `jscpd` with `jscpd-badge` | GitHub integration | CI + PR comments |

**3. Configuration Example (jscpd)**

```json
// .jscpd.json
{
  "threshold": 5,
  "reporters": ["html", "console"],
  "ignore": ["**/node_modules/**", "**/dist/**", "**/*.test.ts"],
  "format": ["typescript"],
  "minLines": 6,
  "minTokens": 50
}
```

### When Duplication Is Acceptable

- **Different domains:** Similar-looking code serving different purposes may be clearer when kept separate.
- **Early-stage code:** Premature abstraction is worse than temporary duplication ("Rule of Three": extract after third occurrence).
- **Slight variations:** Code that is "almost" the same but with meaningful differences may be clearer as separate implementations.

---

## 5. Test Coverage Targets

### Coverage Types

| Type | What It Measures | Typical Threshold |
|---|---|---|
| **Line coverage** | % of executable lines exercised by tests | Baseline metric |
| **Branch coverage** | % of if/else branches taken | More meaningful than line |
| **Function coverage** | % of functions called by tests | Quick check |
| **Statement coverage** | % of statements executed | Similar to line |

### Targets by Layer

| Layer | Target | Rationale |
|---|---|---|
| **Utilities / pure functions** | **>95%** | No dependencies, easy to test, critical correctness. |
| **Domain / business logic** | **>80%** | Core value, complex logic, high risk. |
| **API routes / controllers** | **>70%** | Integration with framework, test success/error paths. |
| **Data access / repositories** | **>60%** | Often thin wrappers; integration tests cover DB behavior. |
| **Integration tests** | **>60%** | Cover service-to-service interactions. |
| **E2E tests** | **>30%** | Expensive to run; cover critical user journeys only. |

### Coverage Configuration Example

```typescript
// jest.config.ts
export default {
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
    "./src/utils/": {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    "./src/domain/": {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    "./src/repositories/": {
      branches: 60,
      functions: 65,
      lines: 65,
      statements: 65,
    },
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/*.interface.ts",
    "!src/**/index.ts",
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/migrations/",
  ],
};
```

### What 100% Coverage Does NOT Mean

- Does not guarantee correctness (tests can assert wrong things).
- Does not cover integration issues.
- Does not cover race conditions or concurrency bugs.
- Does not cover edge cases not represented in tests.

**In a code review:** Flag drops in coverage on PR diffs. Reject PRs that decrease overall coverage below thresholds without explicit justification.

---

## 6. Maintainability Index

### Formula

Microsoft's Maintainability Index (MI):

```
MI = MAX(0, (171 − 5.2 × ln(HV) − 0.23 × CC − 16.2 × ln(LOC)) × 100 / 171)
```

Where:
- **HV** = Halstead Volume (measure of computational complexity)
- **CC** = Cyclomatic Complexity
- **LOC** = Lines of Code

The result is normalized to 0–100.

### Interpretation

| Range | Rating | Meaning |
|---|---|---|
| 85–100 | **Excellent** | Code is easy to maintain and understand. |
| 65–85 | **Good** | Acceptable maintenance effort. |
| 40–65 | **Moderate** | Increasingly difficult to maintain. Flag for review. |
| 0–40 | **Poor** | Significant maintenance burden. Refactor recommended. |

### Practical Example

```typescript
// Low MI: complex function with many operations, high LOC
function processTransaction(tx: Transaction): TransactionResult { // MI ≈ 35
  let result: TransactionResult = { status: "pending" };
  if (tx.type === "purchase") {
    if (tx.amount > 0 && tx.currency === "USD") {
      if (tx.sourceAccount.balance >= tx.amount) {
        if (tx.destinationAccount.isActive) {
          // ... 50 more lines of nested logic
        } else {
          result.error = "Destination inactive";
        }
      } else {
        result.error = "Insufficient funds";
      }
    }
  } else if (tx.type === "refund") {
    // ... 30 more lines
  }
  return result;
}

// High MI: broken into small, focused functions
function processTransaction(tx: Transaction): TransactionResult {
  const handler = txHandlers[tx.type];
  if (!handler) return { status: "error", error: "Unknown type" };
  return handler(tx);
} // MI ≈ 90
```

### Tools

| Tool | How It Calculates MI |
|---|---|
| SonarQube | Built-in MI calculation |
| `typhonjs-escomplex` | JS/TS complexity analysis |
| Visual Studio Metrics | C#/.NET native support |
| `plato` | Generates MI reports for JS |

---

## 7. Using Metrics in Code Reviews

### Which Metrics Matter Most

| Priority | Metric | When to Flag |
|---|---|---|
| 1 | **Cyclomatic Complexity > 15** | Always flag — ask for decomposition. |
| 2 | **LOC per function > 60** | Flag with suggestion to split. |
| 3 | **Test coverage drop on diff** | Block merge if coverage drops below threshold. |
| 4 | **New code duplication > 10 lines** | Flag — suggest extraction. |
| 5 | **High Ce (>5 dependencies)** | Discuss — consider facade or reduced scope. |
| 6 | **MI < 40 on new code** | Strong refactor signal. |

### When NOT to Flag Metrics

- **Generated code** (migrations, protocol buffers, OpenAPI clients).
- **Configuration files** (YAML, JSON, environment configs).
- **Test utilities** — mock factories and helpers may have high LOC but are simple.
- **Temporary scaffolding** — if tagged as tech debt with an issue tracker reference.

### Review Checklist Template

```
## Code Quality Check

- [ ] No function exceeds 60 lines
- [ ] No function has cyclomatic complexity > 15
- [ ] No new code duplication > 10 lines (verified with jscpd)
- [ ] Test coverage on changed files meets threshold
- [ ] New utility modules have >90% branch coverage
- [ ] No unnecessary dependencies added (check package diff)
- [ ] Imports are specific (no barrel file side effects)
- [ ] No dead code removed? (commented-out blocks, unused variables)
- [ ] Error handling follows project conventions
```

### Example CI Integration

```yaml
# .github/workflows/quality.yml
name: Code Quality

on: [pull_request]

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Check coverage thresholds
        run: |
          # Fail if coverage drops below threshold
          npx jest --coverage --coverageThreshold='{"global":{"branches":70,"functions":75,"lines":75,"statements":75}}'

      - name: Check complexity
        run: |
          # Lizard complexity check
          npx lizard -l typescript -x "*_test.ts" -x "*.d.ts" --CCN 15 src/ || echo "Complexity check failed"

      - name: Check duplication
        run: |
          npx jscpd src/ --min-lines 6 --threshold 5 --reporters console

      - name: SonarQube analysis
        uses: SonarSource/sonarqube-scan-action@v2
        with:
          args: >
            -Dsonar.qualitygate.wait=true
            -Dsonar.eslint.reportPaths=eslint-report.json
```

---

## Quick-Reference Summary

| Metric | Good | Warning | Critical | Tool |
|---|---|---|---|---|
| Cyclomatic Complexity | 1–10 | 11–20 | 21+ | ESLint, lizard |
| LOC per Function | 1–40 | 41–60 | 60+ | IDE, custom script |
| Afferent Coupling (Ca) | Low | Moderate | High (>10) | SonarQube, Structure101 |
| Efferent Coupling (Ce) | < 4 | 4–7 | > 7 | SonarQube, dependency-cruiser |
| Code Duplication | < 3% | 3–5% | > 5% | jscpd, SonarQube |
| Test Coverage (unit) | >80% | 60–80% | < 60% | Jest, Istanbul |
| Maintainability Index | 85–100 | 65–84 | < 65 | SonarQube, typhonjs-escomplex |
