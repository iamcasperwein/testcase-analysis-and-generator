# Testing Analysis Document

**Feature:** Retention Pop Up  
**Platform:** Mobile  
**Primary Source:** PRD-Retention Pop Up.pdf (partial, not extracted)  
**RFC:** RFC App and Web (partial, not extracted)  
**Figma:** Figma - App.pdf (extracted), Figma - Web.pdf (extracted)  
**Additional Sources:** PRD-Retention Pop Up.pdf, RFC App and Web, Figma - App.pdf, Figma - Web.pdf

---

## 1. Summary / Overview

The **Retention Pop Up** feature aims to increase booking completion rates by displaying context-aware pop-ups when users attempt to leave the booking flow on mobile. These pop-ups use urgency messaging (e.g., "Stays like this fill up fast") and offer actions to continue booking or leave. The testing goal is to ensure the pop-up triggers correctly, displays the right content for each booking type, and provides a seamless user experience across all supported flows.

---

## 2. Scope

| PRD Ref | Area                   | Priority | Description                                                                 |
|---------|------------------------|----------|-----------------------------------------------------------------------------|
| N/A     | Pop-up Trigger         | High     | Pop-up appears when user attempts to leave booking flow (back, close, etc.) |
| N/A     | Content Variants       | High     | Correct messaging for Flights, Hotels, Trains, Bus, Car Rental, Activities  |
| N/A     | Action Buttons         | High     | "Continue booking" and "Leave for now" actions function as intended         |
| N/A     | Coupon Messaging       | Medium   | Pop-up displays coupon-related message if applicable                        |
| N/A     | UI Consistency         | Medium   | Pop-up matches Figma designs (App & Web)                                    |
| N/A     | Accessibility          | Medium   | Pop-up is accessible (screen reader, contrast, tap targets)                 |
| N/A     | Localization           | Medium   | Pop-up content adapts to language/locale                                    |

**Assumptions:**  
- PRD and RFC are partial/not extracted; scope is inferred from Figma and general context.
- Figma provides extracted copy and UI structure for App and Web.

---

## 3. Impact Analysis

- **UX:**  
  - Positive: Encourages users to complete bookings, clear messaging, actionable choices.
  - Negative: Risk of annoyance if pop-up triggers too frequently or at wrong moments.

- **Backend:**  
  - Minimal impact; pop-up logic likely handled client-side unless coupon/offer data is fetched.

- **Support:**  
  - May increase queries if users are confused by urgency messaging or coupon expiry.

- **Security:**  
  - No sensitive data exposed; ensure pop-up does not leak coupon codes.

- **Performance:**  
  - Pop-up should not cause lag or block main booking flow.

---

## 4. Out of Scope

- **Web Platform:**  
  - Testing is focused on mobile; web-specific pop-up behaviors are not covered.

- **Analytics Tracking:**  
  - Unless specified, pop-up event tracking is not tested.

- **Backend Offer/Coupon Logic:**  
  - Only pop-up display and messaging are tested, not backend coupon validation.

- **Third-party Integrations:**  
  - No testing of external booking or payment providers.

---

## 5. Edge Cases

- Pop-up triggers when user leaves via multiple methods (back button, swipe, close icon).
- Pop-up displays correct variant for mixed bookings (e.g., flight + hotel).
- Coupon messaging appears only when coupon is applied.
- Pop-up does not appear if booking is already completed.
- Pop-up handles rapid user actions (e.g., double-tap to exit).
- Pop-up displays correctly in offline mode (if applicable).
- Pop-up content adapts to device orientation (portrait/landscape).
- Pop-up respects accessibility settings (font size, screen reader).
- Pop-up does not overlap or conflict with other modal dialogs.

---

## 6. Risks & Mitigations

| Risk                                                    | Mitigation                                                        |
|---------------------------------------------------------|-------------------------------------------------------------------|
| Pop-up triggers incorrectly (wrong timing/context)      | Test all exit scenarios; review trigger logic                     |
| Incorrect content variant shown                         | Validate booking type detection and mapping to pop-up copy        |
| Coupon messaging appears when no coupon is applied      | Test with/without coupon scenarios                                |
| Pop-up blocks booking completion or navigation          | Ensure "Continue booking" and "Leave for now" actions work        |
| UI inconsistencies across devices                       | Cross-device UI testing; reference Figma designs                  |
| Accessibility issues                                   | Test with accessibility tools and settings                        |
| Localization errors                                    | Test in all supported languages/regions                           |

---

## 7. Test Strategy Notes

- **Approach:**  
  - Manual exploratory testing for UI/UX, supported by automated UI tests for trigger logic and content variants.
  - Reference Figma - App.pdf for copy and layout; validate against actual implementation.

- **Environment Requirements:**  
  - Test on latest mobile OS versions (iOS, Android).
  - Devices with varying screen sizes and orientations.

- **Test Data Needs:**  
  - Booking flows for each product type (Flights, Hotels, Trains, Bus, Car Rental, Activities).
  - Scenarios with and without applied coupons.
  - Multiple locales/languages.

**Assumptions:**  
- PRD and RFC are partial/not extracted; some requirements may be missing.
- Figma provides extracted UI copy, but not interaction details; test based on available designs.
- If RFC/Figma is missing, avoid invented details and note gaps.

---

**End of Document**