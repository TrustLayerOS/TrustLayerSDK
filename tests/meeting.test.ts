import { shouldRemoveParticipant } from "../src/integrations/meeting";

describe("meeting integration", () => {
  it("removes only on block", () => {
    expect(shouldRemoveParticipant("block")).toBe(true);
    expect(shouldRemoveParticipant("allow")).toBe(false);
    expect(shouldRemoveParticipant("verify")).toBe(false);
    expect(shouldRemoveParticipant("review")).toBe(false);
    expect(shouldRemoveParticipant("monitor")).toBe(false);
  });
});
