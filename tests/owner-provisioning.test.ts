import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let db: typeof import("@/lib/db");
beforeAll(async () => {
  vi.stubEnv("GEOPULSE_DB_PATH", ":memory:");
  vi.stubEnv("ADMIN_EMAIL", "private-owner@example.test");
  db = await import("@/lib/db");
});
afterAll(() => vi.unstubAllEnvs());

const ownerInput = {
  email: "private-owner@example.test", password: "test-only-strong-password-over-20-chars",
  name: "Private Owner", migrateDemoWorkspace: true,
};

describe("explicit owner provisioning", () => {
  it("never gives the demo administrative privileges", () => {
    expect(db.findUserByEmail("demo@geopulse.ai")?.role).toBe("user");
  });

  it("rejects mismatched owner email before any account creation", () => {
    expect(() => db.provisionConfiguredOwner({ ...ownerInput, email: "other@example.test" })).toThrow("ADMIN_EMAIL");
    expect(db.findUserByEmail("other@example.test")).toBeNull();
  });

  it("rolls back owner creation if any workspace transfer fails", () => {
    const demo = db.findUserByEmail("demo@geopulse.ai")!;
    const articles = db.listArticlesByUser(demo.id);
    db.getDb().exec(`CREATE TRIGGER reject_test_transfer BEFORE UPDATE OF user_id ON articles
      BEGIN SELECT RAISE(ABORT, 'test workspace transfer failure'); END`);
    try {
      expect(() => db.provisionConfiguredOwner(ownerInput)).toThrow("test workspace transfer failure");
      expect(db.findUserByEmail(ownerInput.email)).toBeNull();
      expect(db.listArticlesByUser(demo.id)).toEqual(articles);
    } finally {
      db.getDb().exec("DROP TRIGGER reject_test_transfer");
    }
  });

  it("moves workspace history and private integrations atomically without changing article URLs", () => {
    db.updateUserSettings(db.findUserByEmail("demo@geopulse.ai")!.id, {
      llmProvider: "openai", llmApiKey: "test-private-llm-key", llmBaseUrl: "https://llm.example.test/v1",
    });
    const demo = db.findUserByEmail("demo@geopulse.ai")!;
    const articles = db.listArticlesByUser(demo.id);
    const channels = db.listPublishChannels(demo.id);
    const balance = demo.creditsBalance;
    const result = db.provisionConfiguredOwner(ownerInput);
    expect(result.user.role).toBe("admin");
    expect(result.user.email).toBe(ownerInput.email);
    expect(result.user.creditsBalance).toBe(balance);
    expect(result.user.llmApiKey).toBe(demo.llmApiKey);
    expect(result.user.llmBaseUrl).toBe(demo.llmBaseUrl);
    expect(db.listArticlesByUser(result.user.id).map((a) => [a.id, a.slug])).toEqual(articles.map((a) => [a.id, a.slug]));
    expect(db.listArticlesByUser(demo.id)).toHaveLength(0);
    expect(db.listPublishChannels(result.user.id).map((a) => a.id)).toEqual(channels.map((a) => a.id));
    expect(result.transferred.articles).toBe(articles.length);
    const oldDemo = db.findUserById(demo.id)!;
    expect(oldDemo.role).toBe("user");
    expect(oldDemo.apiKey).not.toBe(demo.apiKey);
    expect(oldDemo.creditsBalance).toBe(0);
    expect(oldDemo.llmApiKey).toBe("");
  });

  it("refuses existing owners without resetting their password or changing assets", () => {
    const owner = db.findUserByEmail(ownerInput.email)!;
    const articles = db.listArticlesByUser(owner.id);
    expect(() => db.provisionConfiguredOwner({ ...ownerInput, password: "different-test-password-over-20-chars" })).toThrow("already exists");
    expect(db.findUserByEmail(ownerInput.email)?.passwordHash).toBe(owner.passwordHash);
    expect(db.listArticlesByUser(owner.id)).toEqual(articles);
  });

  it("keeps public createUser unprivileged even when its email is configured ADMIN_EMAIL", () => {
    vi.stubEnv("ADMIN_EMAIL", "unprivileged@example.test");
    const user = db.createUser({ email: "unprivileged@example.test", password: "test-password", name: "Visitor" });
    expect(user.role).toBe("user");
    expect(() => db.provisionConfiguredOwner({ ...ownerInput, email: user.email })).toThrow("already exists");
  });
});
