# Testing Analysis Document
**Feature:** Revamp Login & Register
**Platform:** Mobile
**Version:** Authentication System v1.0
**Document Type:** QA Testing Analysis
**Source:** PRD (PRD_Login_Register.pdf) — RFC: Not Provided — Figma: Not Provided

---

## 1. Summary / Overview

This document outlines the testing analysis for the revamped Login and Registration system on mobile. The feature introduces a modernized onboarding experience covering email/password registration, Google SSO login, forgot password flow, and input validation. Testing will focus on functional correctness, security baseline, and meeting the defined success metrics (≥95% registration completion, <3s login time, 20% reduction in locked account tickets).

> **Note:** RFC and Figma were not provided. UI/UX behavior, API contract details, and specific design interactions are assumed based on standard mobile authentication patterns. These assumptions are flagged throughout and should be validated with the engineering and design teams before test execution.

---

## 2. Scope

The following areas are **in scope** for this testing cycle, mapped directly to PRD functional requirements:

| Req ID | Area | Priority |
|--------|------|----------|
| FR-01 | Email/Password Registration | P0 |
| FR-02 | Social SSO Login (Google) | P1 |
| FR-03 | Forgot Password via Email | P0 |
| FR-04 | Input Validation (email format + password complexity) | P0 |

**Testing Types Covered:**
- Functional testing
- Negative / boundary testing
- Input validation testing
- Basic security testing (auth flows)
- Performance baseline (login time metric)
- Regression testing on auth entry points

---

## 3. Impact Analysis

### Affected Flows
- **New User Journey:** Registration → Email Verification (assumed) → Dashboard access
- **Returning User Journey:** Login (Email or Google SSO) → Dashboard access
- **Recovery Journey:** Forgot Password → Email link → Password reset → Login

### Downstream Impact
- **Session Management:** Any change to auth tokens or session handling may affect all authenticated screens across the app.
- **Dashboard / Home Screen:** Successful login/registration redirects must land on the correct post-auth screen.
- **Email Service Integration:** Forgot Password and potential email verification depend on a third-party or internal email delivery service — failures here directly impact FR-03 and FR-01 completion rates.
- **Google OAuth Integration:** FR-02 depends on Google's OAuth 2.0 flow; any misconfiguration affects SSO login entirely.
- **Account Lockout Logic:** Directly tied to the success metric of reducing locked-account support tickets by 20%. Lockout thresholds and unlock mechanisms must be explicitly tested.

> **Assumption:** Email verification after registration is part of the FR-01 flow. This should be confirmed with the product team.

> **Assumption:** Account lockout exists after N failed login attempts. The threshold value is not defined in the PRD and must be obtained from engineering.

---

## 4. Out of Scope

The following are **explicitly excluded** from this testing cycle based on available documentation:

- Apple Sign-In / other SSO providers (only Google SSO is specified in FR-02)
- Two-Factor Authentication (2FA) — mentioned in the project overview as a goal but **not defined** in the functional requirements table; excluded until a formal requirement is documented
- Biometric login (Face ID / Fingerprint) — not referenced in the PRD
- Account management post-login (profile editing, password change from settings)
- Admin/back-office authentication flows
- Web platform — this cycle is mobile only
- Localization / internationalization testing
- Accessibility (WCAG) compliance testing — no requirement defined in PRD

> **Flag:** The PRD overview mentions "two-factor enabled" as a goal, but no functional requirement (FR-XX) exists for 2FA. This is a gap that should be resolved with the product owner before release.

---

## 5. Edge Cases

### FR-01 — Registration (Email/Password)

- The registration form should block submission when the email field contains a duplicate/already-registered address
- The registration form should display an appropriate error when the email domain is valid in format but non-existent (e.g., `user@fakexyz123.com`)
- The password field should reject input when the value meets length but fails complexity rules (e.g., all lowercase, no special characters)
- The registration form should handle submission gracefully when the network drops mid-request
- The user should be redirected correctly when attempting to register with an email already linked to a Google SSO account

### FR-02 — Google SSO Login

- The SSO flow should handle the case where the user cancels the Google account picker without selecting an account
- The SSO flow should display an appropriate error when Google OAuth returns an error response
- The login flow should correctly handle a Google account that has never been registered on the platform (new user via SSO)
- The SSO button should remain functional when the device has no Google account configured

### FR-03 — Forgot Password

- The forgot password form should send a reset email even when the submitted address is not registered (to prevent user enumeration — assumed security requirement)
- The reset link should expire and show an appropriate error when accessed after the expiry window (assumed: 24 hours — confirm with engineering)
- The reset link should be invalidated after a single use and show an error on reuse
- The password reset form should enforce the same complexity rules as registration when setting a new password
- The forgot password flow should handle multiple reset requests for the same email within a short time window without breaking

### FR-04 — Input Validation

- The email field should reject input when it contains spaces or missing `@` / domain parts
- The password field should enforce minimum length boundary (exact minimum value to be confirmed with engineering)
- The form fields should sanitize input correctly when the user pastes content containing special characters or scripts (XSS baseline check)
- The submit button should remain disabled when required fields are empty on initial load

### General / Cross-Cutting

- All auth screens should render correctly on minimum supported OS versions (iOS and Android — specific versions to be confirmed)
- The keyboard should not obscure input fields when it appears on smaller screen sizes
- Deep links or back-navigation should not allow a logged-in user to return to the login screen without logging out

---

## 6. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R-01 | 2FA referenced in overview but has no FR — may be expected by stakeholders at release | Medium | High | Raise with product owner immediately; get written confirmation of scope before test sign-off |
| R-02 | Google SSO depends on external OAuth service; test environment may not have a stable OAuth sandbox | Medium | High | Confirm test Google credentials and OAuth client config with engineering before sprint start |
| R-03 | Password complexity rules are not explicitly defined in the PRD | High | Medium | Obtain exact rules (min length, required character types) from engineering/backend spec before writing validation test cases |
| R-04 | Email delivery for Forgot Password relies on third-party service; delays may cause flaky tests | Medium | Medium | Use a controlled test inbox (e.g., Mailinator or internal mail stub) in the test environment |
| R-05 | Account lockout threshold is undefined — testing locked-account reduction metric is not fully possible | High | Medium | Request lockout policy from engineering; without it, the 20% reduction success metric cannot be validated |
| R-06 | No Figma provided — UI layout, error message copy, and field behavior are assumed | High | Low–Medium | Conduct a design review session or obtain Figma before final test case sign-off to avoid mismatched expectations |
| R-07 | Performance metric (<3s login time) requires a defined measurement method on mobile | Low | Medium | Agree on measurement approach (e.g., tap-to-dashboard time) and tooling with engineering before performance test execution |

---

## 7. Test Strategy Notes

### Approach
Testing will follow a **risk-based prioritization** aligned to PRD priority levels. P0 requirements (FR-01, FR-03, FR-04) must achieve full functional coverage before P1 (FR-02) is finalized.

### Test Levels

| Level | Applicable To |
|-------|--------------|
| Manual Functional Testing | All FR flows — primary execution method for this cycle |
| Exploratory Testing | Edge cases, error states, navigation flows |
| Performance Spot-Check | Login time metric (<3s) — manual stopwatch or lightweight instrumentation |
| Security Baseline | Input sanitization (FR-04), reset link single-use, enumeration prevention (FR-03) |

### Entry Criteria
- [ ] Build deployed to test environment with all FR-01 through FR-04 features integrated
- [ ] Test Google OAuth credentials available and configured
- [ ] Test email inbox accessible for Forgot Password verification
- [ ] Password complexity rules and lockout thresholds documented by engineering
- [ ] Minimum supported OS versions confirmed

### Exit Criteria
- [ ] All P0 test cases executed with zero open Critical/High defects
- [ ] P1 (Google SSO) test cases executed with no blocking defects
- [ ] Edge cases documented and triaged (accepted, fixed, or deferred with owner)
- [ ] Performance spot-check confirms login time within 3-second target on reference device
- [ ] 2FA scope ambiguity resolved and documented

### Assumptions Summary
1. Email verification is part of the registration completion flow (FR-01).
2. Account lockout exists after repeated failed login attempts (threshold TBD).
3. Forgot password reset links expire after 24 hours and are single-use.
4. Password complexity requires a minimum length plus mixed character types (exact rules TBD).
5. Post-authentication redirect lands on the main dashboard screen.
6. The app supports both iOS and Android mobile platforms (specific OS floor versions TBD).

---

*Document prepared by: Senior QE Engineer*
*Based on: PRD_Login_Register.pdf (Authentication System v1.0)*
*RFC: Not provided | Figma: Not provided*