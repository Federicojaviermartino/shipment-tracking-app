import type { ExternalActor, InternalActor } from "@/domain/perimeter";
import { createTestEstela } from "./create-estela";

/**
 * The whole core at T0 with the five demo personas at hand, for the integration tests. Each test
 * starts its own world: nothing is shared, so the order of tests cannot matter.
 */
export async function startEstela(options: Parameters<typeof createTestEstela>[0] = {}) {
  const world = await createTestEstela(options);
  const actors = world.estela.actors();

  const internal = (userId: string): InternalActor => {
    const actor = actors.find((candidate) => candidate.userId === userId);
    if (actor?.kind !== "internal") throw new Error(`No internal persona ${userId}`);
    return actor;
  };
  const external = (userId: string): ExternalActor => {
    const actor = actors.find((candidate) => candidate.userId === userId);
    if (actor?.kind !== "external") throw new Error(`No external persona ${userId}`);
    return actor;
  };

  return {
    ...world,
    /** Logistics lead: every site, every account. */
    marta: internal("marta.soler"),
    /** Logistics, the Abadiño plant only. */
    iker: internal("iker.zabala"),
    /** Customer support, two accounts: may notify customers and nothing else. */
    lucia: internal("lucia.ferrer"),
    /** Customer, Aquabajío. */
    mariana: external("mariana.olvera"),
    /** Customer, Vauclair. */
    camille: external("camille.roussel"),
  };
}
