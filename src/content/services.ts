/**
 * Service content model (design §3, "Service (content, build-time)").
 *
 * The three services the business offers are maintained here as a source-controlled,
 * typed TypeScript module rather than in a CMS (design Non-Goals). Each entry is typed
 * against the shared {@link Service}/{@link ServiceKey} definitions so the content, the
 * ServicePage component, and the build-time check share one source of truth.
 *
 * Exactly three {@link Service} entries exist, one per {@link ServiceKey}
 * (Requirement 2.1), each with a non-empty `description` and an `includes` list holding
 * at least one item (Requirement 2.2). {@link assertServicesShape} enforces that shape
 * at build time (see src/content/services.check.ts and the astro.config.mjs integration).
 */

import type { Service, ServiceKey } from "../domain/types.js";

/**
 * The three service content entries, in display order, keyed by {@link ServiceKey}.
 *
 * Keeping this a `Record<ServiceKey, Service>` makes the "exactly one entry per key"
 * guarantee a type-level fact: adding, removing, or renaming a key is a compile error.
 * The build-time check additionally verifies the per-entry content shape at runtime so
 * an empty description or an empty includes list fails `astro build`.
 */
export const SERVICES: Record<ServiceKey, Service> = {
  "computer-learning": {
    key: "computer-learning",
    title: "Apprentissage de l'informatique",
    description:
      "Des leçons patientes et individuelles pour vous aider à utiliser votre " +
      "ordinateur, votre tablette ou votre téléphone en toute confiance — à votre " +
      "rythme et avec des mots simples.",
    includes: [
      "Premiers pas avec un ordinateur, une tablette ou un téléphone",
      "Envoyer et lire ses courriels en toute sécurité",
      "Faire des appels vidéo avec la famille et les amis",
      "Naviguer sur Internet et éviter les arnaques en ligne",
      "Installer et organiser ses photos",
    ],
  },
  "computer-repair": {
    key: "computer-repair",
    title: "Dépannage informatique",
    description:
      "Un diagnostic et une réparation attentionnés de votre matériel et de vos " +
      "logiciels, avec des explications claires et sans jargon compliqué.",
    includes: [
      "Diagnostiquer un ordinateur lent ou qui ne répond plus",
      "Supprimer les virus et les logiciels malveillants",
      "Installer et mettre à jour les logiciels",
      "Récupérer et sauvegarder vos fichiers importants",
      "Remplacer le matériel défaillant",
    ],
  },
  "in-home-repair": {
    key: "in-home-repair",
    title: "Petits travaux à domicile",
    description:
      "Une aide fiable pour réparer les petites choses du quotidien chez vous, " +
      "réalisée avec soin et respect par une personne de confiance dans votre foyer.",
    includes: [
      "Petites réparations de plomberie et de fuites",
      "Accrocher étagères, cadres et tringles à rideaux",
      "Remplacer les luminaires et les ampoules",
      "Montage et réparation de petits meubles",
      "Vérifications générales de sécurité du domicile",
    ],
  },
};

/**
 * The three service entries as an array, in {@link SERVICES} display order. Convenient
 * for rendering lists and for generating one static Service_Page per service.
 */
export const SERVICE_LIST: readonly Service[] = Object.values(SERVICES);

/** The three required service keys, in display order (Requirement 2.1). */
export const SERVICE_KEYS: readonly ServiceKey[] = [
  "computer-learning",
  "computer-repair",
  "in-home-repair",
];
