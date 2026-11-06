import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultLocalSettings,
  updateMonthlyBudget,
  updatePreferences,
  updateProfile,
} from "../src/services/localSettings.ts";

test("initial profile is blank and preferences default to INR, day-first, and light", () => {
  const settings = createDefaultLocalSettings();

  assert.deepEqual(settings.profile, {
    displayName: "",
    email: "",
    imageDataUrl: null,
  });
  assert.equal(settings.preferences.defaultCurrency, "INR");
  assert.equal(settings.preferences.dateFormat, "DD/MM/YYYY");
  assert.equal(settings.preferences.appearance, "light");
  assert.equal(settings.budget.amount, null);
});

test("profile edits preserve unspecified fields and can clear the image", () => {
  const initial = createDefaultLocalSettings();
  const edited = updateProfile(initial, {
    displayName: "Asha",
    email: "asha@example.test",
    imageDataUrl: "data:image/png;base64,abc",
  });
  const cleared = updateProfile(edited, { imageDataUrl: null });

  assert.equal(edited.profile.displayName, "Asha");
  assert.equal(edited.profile.email, "asha@example.test");
  assert.equal(cleared.profile.imageDataUrl, null);
  assert.equal(initial.profile.displayName, "");
});

test("preference updates preserve defaults and selected theme", () => {
  const changed = updatePreferences(createDefaultLocalSettings(), {
    appearance: "dark",
    dateFormat: "YYYY-MM-DD",
  });

  assert.equal(changed.preferences.appearance, "dark");
  assert.equal(changed.preferences.dateFormat, "YYYY-MM-DD");
  assert.equal(changed.preferences.defaultCurrency, "INR");
});

test("monthly budget retains its selected currency and rejects invalid values", () => {
  const changed = updateMonthlyBudget(createDefaultLocalSettings(), {
    amount: 500,
    currency: "GBP",
  });

  assert.deepEqual(changed.budget, { amount: 500, currency: "GBP" });
  assert.throws(
    () =>
      updateMonthlyBudget(changed, {
        amount: 0,
        currency: "GBP",
      }),
    /positive amount/
  );
});
