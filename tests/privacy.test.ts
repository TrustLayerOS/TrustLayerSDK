import { assertMediaConsent } from "../src/privacy";

describe("assertMediaConsent", () => {
  it("allows when the user consented", () => {
    expect(() => assertMediaConsent(true)).not.toThrow();
  });

  it("blocks camera/mic without consent", () => {
    expect(() => assertMediaConsent(false)).toThrow("consent_required");
  });
});
