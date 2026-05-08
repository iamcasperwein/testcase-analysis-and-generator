# Testing Analysis Document

| Field | Details |
|---|---|
| **Feature** | Login Register Page 2 |
| **Platform** | Mobile |
| **Primary Source** | PRD — Authentication System v1.0 (`PRD_Login_Register.pdf`) |
| **RFC** | Not provided |
| **Figma** | Not provided |

---

## 1. Summary / Overview

The Authentication System v1.0 introduces a modernized **Login and Registration** experience for the core platform on mobile. The system supports email/password registration, Google SSO login, a forgot-password recovery flow, and client-side input validation.

**Testing Goal:** Validate that all functional registration and login flows operate correctly, securely, and within defined performance thresholds on mobile devices. Ensure edge cases and failure paths are handled gracefully to support the defined success metrics (≥95% registration completion, <3s login time, 20% reduction in locked-account tickets).

> **Note:** RFC and Figma were not provided. UI layout assumptions, API contract details, and visual design specifications are not included. Test cases are derived solely from PRD functional requirements. Any UI-specific or API-specific test scenarios should be revisited once those documents are available.

---

## 2. Scope

The following functional areas are in scope for this testing cycle, mapped directly to PRD requirements:

| PRD ID | Functional Area | Description | Priority |
|---|---|---|---|
| FR-01 | Email/Password Registration | New user account creation via email and password | P0 |
| FR-03 | Forgot Password Flow | Password recovery via email link/OTP | P0 |
| FR-04 | Input Validation | Email format and password complexity enforcement | P0 |
| FR-02 | Google SSO Login | Existing and new user login via Google OAuth | P1 |
| N/A | Session Management | Successful session creation post-login/registration | P1 |
| N/A | Error Handling & Messaging | User-facing error states for all failure paths | P1 |
| N/A | Performance Baseline | Login completion time under 3 seconds | P1 |

### Functional Scenarios in Scope

#### FR-01 — Email/Password Registration
- The registration form **should submit successfully** when all required fields are valid.
- The system **should create a new account** when a unique email and compliant password are provided.
- The system **should prevent duplicate registration** when an already-registered email is submitted.
- The user **should receive a confirmation or next-step prompt** when registration completes successfully.

#### FR-02 — Google SSO Login
- The user **should be redirected to Google OAuth** when the "Sign in with Google" option is tapped.
- The user **should be logged in successfully** when Google authentication is completed and the account exists.
- The system **should create a new account** when Google SSO is used for the first time with an unregistered email.
- The login flow **should fail gracefully** when Google OAuth is cancelled or denied by the user.

#### FR-03 — Forgot Password Flow
- The forgot-password form **should accept a valid email** when the user requests a password reset.
- The system **should send a reset email** when a registered email address is submitted.
- The system **should display a non-revealing message** when an unregistered email is submitted (security consideration).
- The user **should be able to set a new password** when the reset link/token is valid and unexpired.
- The reset link **should be invalidated** when it has already been used or has expired.

#### FR-04 — Input Validation
- The email field **should display an inline error** when an improperly formatted email is entered.
- The password field **should display a complexity error** when the password does not meet defined requirements.
- The submit button **should remain disabled or show an error** when any required field is empty.
- The form **should pass validation** when all fields meet the defined format and complexity rules.

---

## 3. Impact Analysis

### UX Impact
- **Mobile-first interaction:** All tap targets, keyboard types (email keyboard for email fields, secure entry for passwords), and scroll behavior must be validated on both iOS and Android.
- **Error state visibility:** Inline validation errors must be legible and accessible on small screens without obscuring input fields.
- **SSO redirect flow:** The Google OAuth redirect and return-to-app flow must be smooth; broken deep-links or failed redirects will directly harm registration completion rates.
- **Forgot password UX:** A confusing or broken recovery flow is a primary driver of locked-account support tickets — directly tied to the 20% reduction success metric.

### Backend / Integration Impact
- **Account creation endpoint:** Must handle duplicate email conflicts and return appropriate error codes.
- **Google OAuth integration:** Token exchange and user profile retrieval must be validated end-to-end.
- **Password reset token lifecycle:** Expiry, single-use enforcement, and secure delivery via email must be confirmed.
- **Session/token issuance:** A valid session token must be issued upon successful login or registration.

### Security Impact
- **Password complexity enforcement** must be validated both client-side and server-side (FR-04).
- **Reset token security:** Tokens must be time-limited, single-use, and not guessable.
- **Account enumeration risk:** The forgot-password response must not reveal whether an email is registered.
- **SSO token handling:** OAuth tokens must not be exposed in logs or URLs.

### Performance Impact
- The PRD defines a **<3-second average login time** as a success metric. Login flows (both email/password and SSO) must be measured under realistic mobile network conditions (4G/LTE baseline).

### Support Impact
- A well-functioning forgot-password flow directly reduces **locked-account support tickets** by 20% (PRD success metric). Any defects in FR-03 have measurable business impact and should be treated as high-severity.

---

## 4. Out of Scope

The following areas are **explicitly excluded** from this testing cycle:

| Area | Reason for Exclusion |
|---|---|
| Two-Factor Authentication (2FA) | Mentioned in project overview as a goal but **no functional requirement defined** in PRD v1.0 |
| Apple Sign-In / Other SSO Providers | Only Google SSO is specified (FR-02); no other providers are defined |
| Dashboard / Post-Login Features | Out of scope; testing ends at successful session creation |
| Email Delivery Infrastructure | Third-party email service reliability is outside QE scope; only the trigger and UX response are tested |
| Web / Desktop Platform | PRD scope for this cycle is **mobile only** |
| Accessibility (a11y) Audit | No accessibility requirements defined in PRD; recommend adding to a future cycle |
| Localization / Internationalization | No i18n requirements specified in PRD v1.0 |
| UI Visual Regression | Figma not provided; pixel-level UI validation cannot be performed without design specs |
| API Contract / Schema Testing | RFC not provided; API-level contract testing is deferred until RFC is available |

---

## 5. Edge Cases

### Registration (FR-01 / FR-04)

- The system **should reject registration** when an email address that is already associated with an active account is submitted.
- The system **should reject registration** when an email address associated with a Google SSO account (same email) is submitted via email/password.
- The password field **should enforce complexity rules** when a password contains only spaces or whitespace characters.
- The system **should handle maximum-length inputs** when an email or password exceeds typical field length limits (e.g., 255+ characters).
- The registration form **should not submit** when the user rapidly double-taps the submit button (duplicate submission prevention).
- The system **should respond with an appropriate error** when the registration API is unavailable or returns a 5xx error.

### Login — Google SSO (FR-02)

- The app **should return the user to the login screen** when the Google OAuth flow is interrupted by a phone call or app backgrounding.
- The system **should handle token expiry gracefully** when the Google OAuth token cannot be exchanged due to a network timeout.
- The login **should succeed** when the user has previously revoked and then re-granted app permissions in their Google account.

### Forgot Password (FR-03)

- The system **should display a generic confirmation message** when a non-registered email is submitted to prevent account enumeration.
- The reset link **should be rejected** when it is used a second time after a successful password change.
- The reset link **should be rejected** when it is accessed after the expiry window (e.g., 15 or 60 minutes — confirm with backend spec).
- The user **should be able to request a new reset email** when the original link has expired.
- The system **should handle rapid successive reset requests** from the same email without sending unlimited emails (rate limiting).

### Input Validation (FR-04)

- The email field **should reject input** when the value is missing the `@` symbol or domain (e.g., `user@`, `@domain.com`, `userdomain.com`).
- The email field **should accept valid input** when an email contains subdomains or uncommon TLDs (e.g., `user@mail.co.uk`).
- The password field **should reject input** when the value meets length but fails complexity (e.g., all lowercase, no special characters — pending complexity rules confirmation).
- The form **should handle special characters** in the password field without breaking encoding or causing injection vulnerabilities.

### Network & Device Edge Cases

- All flows **should display a meaningful error state** when the device has no internet connectivity.
- All flows **should recover correctly** when connectivity is restored after a mid-flow network drop.
- The login flow **should complete within the 3-second SLA** when tested on a mid-range Android device on a 4G network.

---

## 6. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | **No RFC available** — API contracts, error codes, and token behavior are undefined | High | High | Document assumptions; flag all API-dependent test cases as blocked until RFC is provided; coordinate with backend team for verbal spec |
| R-02 | **No Figma available** — UI layout, error message copy, and component behavior cannot be verified against design | High | Medium | Test functional behavior only; defer visual/UX regression; request Figma before final sign-off |
| R-03 | **2FA referenced in overview but not in requirements** — may be partially implemented and untested | Medium | High | Confirm with PM whether 2FA is in or out of scope for v1.0; do not assume it is absent from the build |
| R-04 | **Google SSO dependency** — OAuth flow is subject to Google's external service availability and policy changes | Medium | High | Use a dedicated test Google account; mock OAuth responses in lower environments; test on real devices for E2E |
| R-05 | **Password complexity rules not fully specified** — FR-04 references complexity but does not define rules | High | Medium | Request explicit complexity rules from PM/backend before writing validation test cases; use common standards as interim assumption |
| R-06 | **Duplicate submission / race conditions** on registration | Low | Medium | Include double-tap and rapid-submit test cases; verify idempotency handling on the backend |
| R-07 | **Reset token expiry window not defined** in PRD | Medium | Medium | Confirm expiry duration with backend team; test at boundary (just before and just after expiry) |
| R-08 | **Mobile OS fragmentation** — behavior may differ between iOS and Android for SSO and keyboard handling | Medium | Medium | Execute critical P0 flows on at minimum one current iOS device and one current Android device |

---

## 7. Test Strategy Notes

### Approach

- **Testing Type:** Functional black-box testing is the primary approach, supplemented by exploratory testing for edge cases and error paths.
- **Priority Execution Order:** P0 requirements (FR-01, FR-03, FR-04) must achieve full test coverage before P1 requirements (FR-02) are executed.
- **Regression Scope:** All four functional areas should be included in the regression suite given their interdependency (e.g., SSO and email registration may share the same account store).
- **Performance Testing:** Login time must be measured as an end-to-end wall-clock time from tap to dashboard/home screen load. Target: <3 seconds on a 4G network with a mid-range device.
- **Security Smoke Tests:** Include basic checks for account enumeration (FR-03), password field masking, and absence of credentials in network logs.

### Environment Requirements

| Environment | Purpose |
|---|---|
| **Staging / QA Environment** | Primary test environment; must have isolated user database to avoid production data conflicts |
| **Real iOS Device** (current major OS version) | Required for SSO redirect flow and keyboard behavior validation |
| **Real Android Device** (current major OS version, mid-range spec) | Required for performance baseline and SSO validation |
| **Network Simulation** | 4G/LTE for performance tests; offline/airplane mode for connectivity edge cases |
| **Email Inbox Access** | A dedicated test email account with accessible inbox is required for FR-01 confirmation and FR-03 reset flow |
| **Google Test Account** | A dedicated Google account for SSO testing; must not be used for other services |

### Test Data Needs

| Data Item | Details |
|---|---|
| **Valid unregistered email** | For new registration happy path |
| **Already-registered email** | For duplicate registration edge case |
| **Google account credentials** | Dedicated test account for SSO flow |
| **Invalid email formats** | Set of malformed emails for FR-04 validation (e.g., `test@`, `@test.com`, `testtest.com`, `test @test.com`) |
| **Password variants** | Valid password, too-short password, missing complexity password, max-length password, special-character-only password |
| **Expired reset token** | Pre-generated or time-advanced token for FR-03 expiry edge case |
| **Used reset token** | Token that has already completed a reset cycle |

### Assumptions (Due to Missing RFC / Figma)

> The following assumptions are made in the absence of RFC and Figma. These **must be validated** with the engineering and design teams before test execution begins.

- Password complexity is assumed to require a minimum of 8 characters, at least one uppercase letter, one number, and one special character (industry standard). **Confirm with backend team.**
- Reset token expiry is assumed to be between 15–60 minutes. **Confirm with backend team.**
- The registration flow is assumed to include an email verification step post-submission. **Confirm with PM.**
- Error messages are assumed to be displayed inline below the relevant field. **Confirm with Figma when available.**
- The Google SSO flow uses the native Google Sign-In SDK (not a web view). **Confirm with engineering.**
- No biometric login (Face ID / Fingerprint) is in scope for this version, as it is not mentioned in the PRD.