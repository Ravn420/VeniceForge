import { makeId, type FixRecipe, type RemedyPlan } from "@forge/contracts";

const DEMOTE_AFTER = 2;

/**
 * Verified remedies, keyed by signature hash plus environment. A recipe that
 * fails twice is demoted and the ladder resumes from the top.
 */
export class RecipeStore {
  private readonly byKey = new Map<string, FixRecipe>();

  private key(hash: string, env: string): string {
    return `${hash}::${env}`;
  }

  remember(hash: string, env: string, plan: RemedyPlan): FixRecipe {
    const recipe: FixRecipe = {
      id: makeId("rcp"),
      signatureHash: hash,
      envFingerprint: env,
      plan,
      verifiedAt: Date.now(),
      consecutiveFailures: 0,
      demoted: false
    };
    this.byKey.set(this.key(hash, env), recipe);
    return recipe;
  }

  find(hash: string, env: string): FixRecipe | null {
    const r = this.byKey.get(this.key(hash, env));
    if (!r || r.demoted) return null;
    return r;
  }

  noteFailure(hash: string, env: string): void {
    const r = this.byKey.get(this.key(hash, env));
    if (!r) return;
    r.consecutiveFailures += 1;
    if (r.consecutiveFailures >= DEMOTE_AFTER) r.demoted = true;
  }

  noteSuccess(hash: string, env: string): void {
    const r = this.byKey.get(this.key(hash, env));
    if (r) r.consecutiveFailures = 0;
  }

  all(): FixRecipe[] {
    return [...this.byKey.values()];
  }
}