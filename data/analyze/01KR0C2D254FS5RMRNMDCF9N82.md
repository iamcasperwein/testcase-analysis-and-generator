# Testing Analysis Document

| Field | Details |
|---|---|
| **Feature** | Revamp Login & Register |
| **Platform** | Mobile |
| **Primary Source** | PRD_Login_Register.pdf (Authentication System v1.0) |
| **RFC** | Not provided |
| **Figma** | Not provided |

---

## 1. Summary / Overview

The Authentication System v1.0 modernizes the user onboarding experience by introducing a secure **Login and Registration** system for a core mobile platform. The system supports email/password registration, Google SSO login, a forgot-password recovery flow, and strict input validation.

**Testing Goal:** Validate that all functional requirements are implemented correctly, securely, and performantly on mobile — ensuring new and returning users can authenticate without friction, and that the system meets defined success metrics (≥95% registration completion, <3s login time, 20% reduction in locked-account tickets).

> **Note:** RFC and Figma were not provided. UI layout assumptions, API contract details, and design-specific behaviors are not included. Test cases are derived solely from PRD functional requirements.

---

## 2. Scope

The following functional areas are in scope for this testing cycle:

| # | Functional Area | PRD Ref | Priority | Notes |
|---|---|---|---|---|
| 1 | Email/Password Registration | FR-01 | P0 | Full happy path and error flows |
| 2 | Google SSO Login | FR-02 | P1 | OAuth handshake and session creation |
| 3 | Forgot Password (Email Flow) | FR-03 | P0 | Request, email delivery, reset link |
| 4 | Input Validation — Email Format | FR-04 | P0 | Format rules on registration and login |
| 5 | Input Validation — Password Complexity | FR-04 | P0 | Complexity rules on registration and reset |
| 6 | Login via Email/Password | FR-01 (implied) | P0 | Existing user authentication |
| 7 | Session Management | FR-01, FR-02 | P0 | Token issuance, persistence, expiry |
| 8 | Performance — Login Response Time | Success Metrics | P0 | Must be under 3 seconds |

---

## 3. Impact Analysis

### 3.1 User Experience (UX)
- **New users** must complete registration without ambiguity; poor validation messaging will directly impact the 95% completion rate metric.
- **Returning users** expect fast, frictionless login; any latency above 3 seconds degrades trust.
- Mobile-specific concerns (soft keyboard behavior, tap target sizes, autofill support) are assumed in scope but **cannot be fully verified without Figma specs** — flagged as a risk.

### 3.2 Backend / API
- Registration endpoint must enforce email uniqueness and return appropriate error codes.
- Password hashing and storage must follow security best practices (e.g., bcrypt/argon2); this should be verified via security review or backend audit.
- Google SSO requires a valid OAuth 2.0 integration; token exchange and user profile mapping must be validated.
- Forgot Password flow depends on a reliable email delivery service (transactional email provider); delivery latency is a dependency risk.

### 3.3 Security
- **Authentication tokens** (JWT or session cookies) must be securely stored on mobile (e.g., Keychain on iOS, Keystore on Android) — not in plain SharedPreferences or AsyncStorage.
- **Brute-force protection** (rate limiting / account lockout) is implied by the "Locked Account" support ticket metric but **not explicitly defined in the PRD** — this is a gap requiring clarification.
- Password reset links must be single-use and time-limited to prevent replay attacks.
- SSO tokens must not be logged or exposed in analytics events.

### 3.4 Support Impact
- A successful implementation should reduce "Locked Account" support tickets by **20%** — implying the current flow has usability or reliability issues.
- Clear error messaging and a reliable Forgot Password flow are the primary levers for this metric.

### 3.5 Performance
- Login response time must be **under 3 seconds** end-to-end on mobile (including network round-trip).
- Tests should be conducted on both high-speed Wi-Fi and simulated degraded network conditions (3G/4G).

---

## 4. Out of Scope

| # | Area | Reason |
|---|---|---|
| 1 | Apple Sign-In / Facebook SSO | Not mentioned in PRD; only Google SSO (FR-02) is specified |
| 2 | Two-Factor Authentication (2FA) UI flows | PRD mentions "two-factor enabled" in overview but provides no functional requirements for 2FA — **flagged as a PRD gap, not tested** |
| 3 | Dashboard / Post-login features | Testing ends at successful session creation; downstream features are out of scope |
| 4 | Web / Desktop platform | Platform is explicitly **mobile** only |
| 5 | Backend infrastructure & DevOps | Load testing at infrastructure level, server configuration, and deployment pipelines are not in scope |
| 6 | Accessibility (a11y) testing | No accessibility requirements defined in PRD; recommended as a follow-up |
| 7 | Localization / i18n | No multi-language requirements stated in PRD |
| 8 | Admin / Back-office user management | Not referenced in PRD |

> ⚠️ **PRD Gap — 2FA:** The Project Overview references a "two-factor enabled" system, but no functional requirements (FR-xx) define the 2FA flow. This must be clarified with the Product Owner before final test coverage is confirmed.

---

## 5. Edge Cases

### 5.1 Registration (FR-01, FR-04)

- The registration form **should display an inline error** when the user submits with an already-registered email address.
- The registration form **should reject submission** when the password does not meet complexity requirements (e.g., minimum length, special characters — exact rules to be confirmed with PO).
- The registration form **should display a validation error** when the email field contains an invalid format (e.g., `user@`, `@domain.com`, `plaintext`).
- The registration form **should handle gracefully** when the user submits with all fields empty.
- The registration form **should preserve entered data** when the user navigates away and returns (back navigation on mobile).
- The system **should not create a duplicate account** when the same email is submitted twice in rapid succession (race condition / double-tap).
- The password field **should mask input by default** and allow the user to toggle visibility.

### 5.2 Login — Email/Password (FR-01 implied)

- The login form **should display a generic error message** (not specifying which field is wrong) when credentials are invalid, to prevent user enumeration.
- The login session **should persist appropriately** when the app is backgrounded and reopened.
- The login form **should handle gracefully** when the user submits with the email field empty.
- The login form **should handle gracefully** when the user submits with the password field empty.

### 5.3 Google SSO (FR-02)

- The SSO flow **should complete successfully** when the user selects a valid Google account.
- The SSO flow **should display an appropriate error** when the user cancels the Google account picker.
- The SSO flow **should handle gracefully** when the Google OAuth token is expired or revoked mid-session.
- The system **should link the SSO account to an existing email/password account** when the same email already exists — behavior (merge vs. error) must be confirmed with PO.
- The SSO flow **should not proceed** when network connectivity is lost during the OAuth handshake.

### 5.4 Forgot Password (FR-03)

- The forgot-password form **should send a reset email** when a valid, registered email is submitted.
- The forgot-password form **should display a neutral confirmation message** (not confirming whether the email exists) when an unregistered email is submitted, to prevent user enumeration.
- The password reset link **should be invalid after use** when the user attempts to reuse it.
- The password reset link **should be invalid after expiry** when the user opens it beyond the time limit (expiry window to be confirmed with PO).
- The reset flow **should enforce password complexity rules** when the user sets a new password.
- The system **should handle gracefully** when the user requests multiple password reset emails in quick succession (rate limiting behavior).

### 5.5 Input Validation — Boundary Conditions (FR-04)

- The email field **should reject input** when it exceeds the maximum character length (boundary value to be confirmed).
- The password field **should reject submission** when the password is exactly one character below the minimum length requirement.
- The password field **should accept submission** when the password is exactly at the minimum length requirement.
- The system **should sanitize inputs** when fields contain SQL injection patterns, script tags, or special characters.

### 5.6 Performance & Network

- The login response **should complete in under 3 seconds** when tested on a standard 4G mobile network.
- The login form **should display a meaningful error** when the server is unreachable or returns a timeout.
- The registration flow **should not submit duplicate requests** when the user taps the submit button multiple times quickly.

---

## 6. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | **2FA scope ambiguity** — PRD overview mentions 2FA but no FR is defined | High | High | Escalate to Product Owner immediately; block 2FA test cases until clarified |
| R-02 | **No Figma provided** — UI layout, error state designs, and component behavior are unknown | High | Medium | Base tests on functional requirements only; flag UI deviations as observations, not defects, until design is confirmed |
| R-03 | **Password complexity rules not specified** — FR-04 references complexity but no rules are defined | High | Medium | Request explicit rules from PO/backend team before writing validation test cases |
| R-04 | **Google SSO dependency** — OAuth integration relies on third-party availability | Medium | High | Use a dedicated test Google account; mock OAuth responses for negative/edge case testing in lower environments |
| R-05 | **Email delivery reliability** — Forgot Password and registration confirmation depend on transactional email | Medium | High | Coordinate with backend team to use a test mailbox (e.g., Mailosaur, Mailtrap) in QA environment |
| R-06 | **Account lockout behavior undefined** — No FR specifies lockout thresholds, yet support metric implies it exists | Medium | High | Investigate existing backend behavior; document findings and raise as a PRD gap |
| R-07 | **Mobile token storage security** — Insecure storage could expose sessions | Low | Critical | Include a security-focused test pass; verify storage mechanism with mobile dev team |
| R-08 | **Race conditions on registration** — Double-tap or network retry could create duplicate accounts | Low | Medium | Test with rapid successive submissions; verify backend idempotency |

---

## 7. Test Strategy Notes

### 7.1 Testing Approach

- **Functional Testing:** Cover all P0 requirements (FR-01, FR-03, FR-04) exhaustively before P1 (FR-02).
- **Negative Testing:** Prioritize invalid inputs, error states, and boundary conditions — these directly impact the 95% completion rate and locked-account metrics.
- **Security Testing (Exploratory):** Manually verify token storage, reset link behavior, and input sanitization. A formal security audit is recommended separately.
- **Performance Testing:** Measure login response time using real devices on throttled network profiles (Wi-Fi, 4G, 3G). Target: <3 seconds.
- **Regression Testing:** After each build, re-run P0 smoke tests covering registration, login, and forgot-password happy paths.

### 7.2 Environment Requirements

- **QA Mobile Environment** with access to a staging backend (not production).
- **Real devices required:** Minimum one iOS device and one Android device to cover platform-specific behaviors (Keychain vs. Keystore, Google Sign-In SDK differences).
- **Network simulation:** Ability to throttle network to 3G/4G (e.g., via Charles Proxy or device developer settings).
- **Test email service:** Mailbox accessible to QA team (e.g., Mailtrap, Mailosaur) for Forgot Password and registration email verification.
- **Google test account:** Dedicated Google account for SSO testing — must not be a personal account.

### 7.3 Test Data Needs

| Data Type | Details |
|---|---|
| Valid registered user | Email + password account pre-seeded in staging DB |
| Unregistered email | Email address confirmed not to exist in staging |
| Google test account | Dedicated Google account authorized for staging OAuth client |
| Invalid email formats | Set of malformed emails: `user@`, `@domain.com`, `nodomain`, `user@domain` |
| Weak passwords | Passwords that fail complexity rules (to be defined) |
| Expired reset token | Mechanism to generate or fast-forward an expired reset link |
| Boundary-length inputs | Max-length strings for email and password fields |

### 7.4 Entry & Exit Criteria

**Entry Criteria:**
- Build is deployed to QA environment and smoke-tested by the dev team.
- Registration and login endpoints are confirmed functional by backend.
- Test email service is configured and accessible.
- Password complexity rules are documented and shared with QA.

**Exit Criteria:**
- All P0 test cases executed with no open **Critical** or **High** severity defects.
- P1 (Google SSO) test cases executed with no open Critical defects.
- Performance benchmark (login <3s) validated on at least one iOS and one Android device.
- All identified PRD gaps (2FA, lockout behavior, password rules) are either resolved or formally deferred with PO sign-off.

### 7.5 Assumptions

> The following assumptions are made due to missing RFC and Figma documentation:
> - Error messages are displayed inline on the relevant field (standard mobile UX pattern).
> - The app uses native Google Sign-In SDK (not a WebView-based flow).
> - Password reset links are delivered via email (no SMS alternative is assumed).
> - Session tokens are expected to persist across app restarts (standard "stay logged in" behavior).
> - No CAPTCHA or bot-detection mechanism is assumed unless confirmed by the backend team.