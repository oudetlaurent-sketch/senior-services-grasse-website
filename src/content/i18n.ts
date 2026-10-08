/**
 * Localized content model (design "Data Models", "Localized content model").
 *
 * This module is the single source of truth for every visitor-facing string on the
 * site, authored per Supported_Language (French — the default — and English). Each
 * static per-language route is rendered from the matching language's {@link Messages}
 * entry (Requirement 7.6), so the French and English pages share one structural shape
 * and differ only in their string values.
 *
 * What lives here (design §1/§10/§11, Data Models):
 * - all navigation / page titles (home, the three services, about, scheduling,
 *   service-request), the skip-link label, the Language_Selector option labels, and the
 *   Language_Selector group label ("Langue" / "Language"),
 * - the footer contact-block labels — including the email label, which is the WORD
 *   "Email" in BOTH languages, never "Courriel" (Requirement 10.3) — and the Grasse
 *   service-area statement (Requirements 8.1, 8.3),
 * - the Home_Page copy (one-sentence business description, intro, section headings),
 * - per-language {@link ServiceContent} for the three services (title / description /
 *   includes), keyed by the stable English {@link ServiceKey} (Requirement 2.2),
 * - the About_Page name + provisional bio marked `provisional` (Requirement 11.4),
 * - the Scheduling_Page chrome — heading, instructions, "coming soon" placeholder, and
 *   load-failure fallback text (Requirements 12.3, 12.4, 12.5),
 * - the Confirmation_Message (Requirement 4.3), and
 * - every validation error message, keyed by the stable machine-readable
 *   {@link ErrorCode} (Requirement 7.6).
 *
 * The French entries are migrated verbatim from the strings that previously lived
 * inline in src/content/services.ts, src/content/business.ts, src/domain/validation.ts,
 * src/integration/handle-service-request.ts, and the French page copy; the English
 * entries are natural translations authored alongside. The stable identifiers
 * ({@link PageKey}, {@link ServiceKey}, {@link ErrorCode}) are never translated — only
 * the display strings differ per language. Rewiring pages/components to read from this
 * dictionary is deferred to later tasks (18.2–18.5, 19, 20, 21); this task establishes
 * the dictionary as the new source of truth.
 */

import type { Language, LocalizedContent, Messages } from "../domain/types.js";

/**
 * French (default) copy — migrated from the existing modules and page copy. All strings
 * are authored in a warm, friendly, lightly playful tone that stays clear and
 * respectful for senior visitors (Requirement 9.5).
 */
const FR: Messages = {
  nav: {
    home: "Accueil",
    "computer-learning": "Apprentissage de l'informatique",
    "computer-repair": "Dépannage informatique",
    "in-home-repair": "Petits travaux à domicile",
    about: "Qui suis-je ?",
    scheduling: "Prendre rendez-vous",
    "service-request": "Demande de service",
  },
  languageSelector: { fr: "Français", en: "English" },
  languageSelectorLabel: "Langue",
  emailLabel: "Email",
  skipLink: "Aller au contenu principal",
  footer: {
    phoneLabel: "Téléphone",
    emailLabel: "Email",
    serviceAreaStatement:
      "Nous intervenons à Grasse (06130) et dans les communes alentour, " +
      "sur toute la Riviera : Mouans-Sartoux, Pégomas, Le Tignet, Peymeinade et au-delà.",
  },
  home: {
    description:
      "Un coup de main chaleureux, à votre rythme : nous aidons les seniors à " +
      "apprivoiser leur ordinateur, à le remettre d'aplomb quand il fait des siennes, " +
      "et à réparer les petites choses du quotidien à la maison.",
    intro:
      "Prêt à vous lancer ? Dites-nous ce dont vous avez besoin et nous vous " +
      "recontactons avec plaisir.",
    // Hero_Banner copy (Requirement 16.1, 16.9). Warm, senior-friendly headline + a
    // short supporting sentence, with a primary call to action to the request form.
    hero: {
      headline: "Un coup de main à domicile, en toute confiance",
      tagline:
        "Informatique, dépannage et petits travaux du quotidien : une aide patiente " +
        "et chaleureuse, chez vous, à Grasse et aux alentours.",
      cta: "Demander un service",
    },
    headings: {
      services: "Nos services",
      request: "Demander un service",
      contact: "Nous contacter",
    },
  },
  // How_It_Works steps section (Requirements 13.1, 13.2). Three ordered, warm steps.
  howItWorks: {
    heading: "Comment ça marche",
    steps: [
      "Choisissez le service qui vous convient : apprentissage de l'informatique, " +
        "dépannage informatique ou petits travaux à domicile.",
      "Envoyez-nous une demande en quelques mots, ou prenez rendez-vous en ligne — " +
        "sans engagement et sans compte à créer.",
      "Nous vous recontactons avec plaisir pour en parler ensemble et convenir du " +
        "meilleur moment.",
    ],
  },
  // Reassurance_Element (Requirements 14.1, 14.2, 14.3): names My Name + Grasse
  // (06130), states no obligation and that we contact the Visitor to confirm.
  reassurance: {
    heading: "En toute confiance",
    body:
      "Derrière ce service, il y a une personne : My Name, à Grasse (06130) et " +
      "dans les communes alentour. Faire une demande ou prendre rendez-vous ne vous " +
      "engage à rien — c'est gratuit et sans création de compte. Nous vous recontactons " +
      "simplement pour confirmer avec vous le jour et l'heure qui vous arrangent.",
  },
  // FAQ_Section (Requirements 15.1, 15.2): three+ Q&A for common senior concerns.
  // Answers mentioning a demande / un rendez-vous are worded so a later task (task 26.2)
  // can link them to the form / scheduling page (Requirement 15.3).
  faq: {
    heading: "Questions fréquentes",
    items: [
      {
        question: "Est-ce payant de faire une demande ?",
        answer:
          "Non, faire une demande de service ou prendre rendez-vous est entièrement " +
          "gratuit et sans engagement. Vous n'avez aucun compte à créer : il suffit de " +
          "remplir le formulaire ou de choisir un créneau.",
      },
      {
        question: "Où intervenez-vous ?",
        answer:
          "Nous intervenons à Grasse (06130) et dans les communes alentour sur la " +
          "Riviera : Mouans-Sartoux, Pégomas, Le Tignet, Peymeinade et au-delà.",
      },
      {
        question: "Comment puis-je vous contacter ?",
        answer:
          "Comme vous préférez : par téléphone, par e-mail, en remplissant le " +
          "formulaire de demande de service, ou en prenant rendez-vous en ligne. Nous " +
          "vous recontactons ensuite pour confirmer.",
      },
      {
        question: "Faut-il s'y connaître en informatique pour vous solliciter ?",
        answer:
          "Pas du tout. Nous expliquons tout avec des mots simples, à votre rythme, et " +
          "sans jargon compliqué. Il n'y a pas de question « bête ».",
      },
    ],
  },
  services: {
    "computer-learning": {
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
  },
  about: {
    name: "My Name",
    // Final About biography (Requirement 11.4): provisional flag is false.
    bio:
      "Ingénieur chez Amadeus, j'ai occupé des responsabilités techniques et " +
      "managériales au sein d'équipes internationales. J'ai contribué à résoudre des " +
      "défis complexes, encadré et formé de nombreux collaborateurs, tout en cultivant " +
      "un esprit d'entraide, de transmission des connaissances et de réussite collective.",
    provisional: false,
    photoAlt: "My Name",
  },
  scheduling: {
    heading: "Prendre rendez-vous",
    instructions:
      "Choisissez le créneau qui vous convient dans le calendrier ci-dessous et " +
      "réservez votre rendez-vous en quelques clics.",
    placeholder:
      "La prise de rendez-vous en ligne arrive bientôt. En attendant, écrivez-nous ou " +
      "appelez-nous et nous conviendrons ensemble d'un moment.",
    errorFallback:
      "Le calendrier de réservation n'a pas pu se charger. Vous pouvez nous joindre " +
      "directement pour fixer un rendez-vous :",
  },
  confirmation:
    "Merci ! Votre demande a bien été reçue. Nous vous recontacterons très bientôt.",
  errors: {
    required: "Ce champ est obligatoire.",
    too_long: "Ce champ dépasse le nombre de caractères autorisé.",
    too_short: "Ce champ est trop court.",
    invalid_email: "Veuillez saisir une adresse e-mail valide.",
    invalid_phone:
      "Le numéro de téléphone ne peut contenir que des chiffres, des espaces et les caractères + - ( ).",
    unknown_service: "Veuillez choisir l'un des services proposés.",
  },
};

/**
 * English copy — natural translations of the French entries, authored in the same warm,
 * friendly, lightly playful tone for senior visitors (Requirement 9.5). Stable
 * identifiers are unchanged; only the display strings are translated.
 */
const EN: Messages = {
  nav: {
    home: "Home",
    "computer-learning": "Computer Learning",
    "computer-repair": "Computer Repair",
    "in-home-repair": "In-Home Repair",
    about: "About",
    scheduling: "Book a Meeting",
    "service-request": "Service Request",
  },
  languageSelector: { fr: "Français", en: "English" },
  languageSelectorLabel: "Language",
  emailLabel: "Email",
  skipLink: "Skip to main content",
  footer: {
    phoneLabel: "Phone",
    emailLabel: "Email",
    serviceAreaStatement:
      "We serve Grasse (06130) and the surrounding towns across the Riviera: " +
      "Mouans-Sartoux, Pégomas, Le Tignet, Peymeinade and beyond.",
  },
  home: {
    description:
      "A warm helping hand, at your own pace: we help seniors get comfortable with " +
      "their computer, get it back on its feet when it misbehaves, and fix the little " +
      "everyday things around the home.",
    intro:
      "Ready to get started? Tell us what you need and we'll be glad to get back to you.",
    // Hero_Banner copy (Requirement 16.1, 16.9). Warm, senior-friendly headline + a
    // short supporting sentence, with a primary call to action to the request form.
    hero: {
      headline: "A helping hand at home, with confidence",
      tagline:
        "Computer help, repairs, and small everyday tasks: patient, warm support in " +
        "your own home, in Grasse and the surrounding towns.",
      cta: "Request a service",
    },
    headings: {
      services: "Our services",
      request: "Request a service",
      contact: "Get in touch",
    },
  },
  // How_It_Works steps section (Requirements 13.1, 13.2). Three ordered, warm steps.
  howItWorks: {
    heading: "How it works",
    steps: [
      "Choose the service that suits you: computer learning, computer repair, or " +
        "in-home repair.",
      "Send us a request in a few words, or book a meeting online — with no obligation " +
        "and no account to create.",
      "We'll be glad to get back to you so we can talk it through and find the time " +
        "that works best for you.",
    ],
  },
  // Reassurance_Element (Requirements 14.1, 14.2, 14.3): names My Name + Grasse
  // (06130), states no obligation and that we contact the Visitor to confirm.
  reassurance: {
    heading: "With confidence",
    body:
      "Behind this service there's a real person: My Name, based in Grasse " +
      "(06130) and the surrounding towns. Making a request or booking a meeting places " +
      "you under no obligation — it's free and needs no account. We'll simply get back " +
      "to you to confirm the day and time that suit you.",
  },
  // FAQ_Section (Requirements 15.1, 15.2): three+ Q&A for common senior concerns.
  // Answers mentioning a request / a meeting are worded so a later task (task 26.2) can
  // link them to the form / scheduling page (Requirement 15.3).
  faq: {
    heading: "Frequently asked questions",
    items: [
      {
        question: "Is it free to make a request?",
        answer:
          "Yes. Making a service request or booking a meeting is completely free and " +
          "with no obligation. There's no account to create: just fill in the form or " +
          "pick a time slot.",
      },
      {
        question: "Where do you work?",
        answer:
          "We work in Grasse (06130) and the surrounding towns on the Riviera: " +
          "Mouans-Sartoux, Pégomas, Le Tignet, Peymeinade and beyond.",
      },
      {
        question: "How can I reach you?",
        answer:
          "Whichever way you prefer: by phone, by email, by filling in the service " +
          "request form, or by booking a meeting online. We'll then get back to you to " +
          "confirm.",
      },
      {
        question: "Do I need to know about computers to contact you?",
        answer:
          "Not at all. We explain everything in plain words, at your own pace, and " +
          "without complicated jargon. There's no such thing as a silly question.",
      },
    ],
  },
  services: {
    "computer-learning": {
      title: "Computer Learning",
      description:
        "Patient, one-on-one lessons to help you use your computer, tablet, or phone " +
        "with confidence — at your own pace and in plain words.",
      includes: [
        "First steps with a computer, tablet, or phone",
        "Sending and reading email safely",
        "Making video calls with family and friends",
        "Browsing the Internet and avoiding online scams",
        "Setting up and organizing your photos",
      ],
    },
    "computer-repair": {
      title: "Computer Repair",
      description:
        "Careful diagnosis and repair of your hardware and software, explained clearly " +
        "and without complicated jargon.",
      includes: [
        "Diagnosing a slow or unresponsive computer",
        "Removing viruses and malware",
        "Installing and updating software",
        "Recovering and backing up your important files",
        "Replacing failing hardware",
      ],
    },
    "in-home-repair": {
      title: "In-Home Repair",
      description:
        "Reliable help fixing the small everyday things around your home, done with " +
        "care and respect by someone you can trust in your home.",
      includes: [
        "Small plumbing repairs and leaks",
        "Hanging shelves, frames, and curtain rails",
        "Replacing light fixtures and bulbs",
        "Assembling and repairing small furniture",
        "General home safety checks",
      ],
    },
  },
  about: {
    name: "My Name",
    // Final About biography (Requirement 11.4) — English equivalent of the FR copy.
    bio:
      "An engineer at Amadeus, I held technical and managerial responsibilities within " +
      "international teams. I helped solve complex challenges, mentored and trained many " +
      "colleagues, and fostered a spirit of mutual support, knowledge sharing, and " +
      "collective success.",
    provisional: false,
    photoAlt: "My Name",
  },
  scheduling: {
    heading: "Book a Meeting",
    instructions:
      "Pick the time that suits you in the calendar below and book your meeting in " +
      "just a few clicks.",
    placeholder:
      "Online booking is coming soon. In the meantime, send us a message or give us a " +
      "call and we'll arrange a time together.",
    errorFallback:
      "The booking calendar couldn't load. You can reach us directly to set up a " +
      "meeting:",
  },
  confirmation:
    "Thank you! Your request has been received. We'll get back to you very soon.",
  errors: {
    required: "This field is required.",
    too_long: "This field exceeds the maximum number of characters allowed.",
    too_short: "This field is too short.",
    invalid_email: "Please enter a valid email address.",
    invalid_phone:
      "The phone number may contain only digits, spaces, and the characters + - ( ).",
    unknown_service: "Please choose one of the services offered.",
  },
};

/**
 * The whole site's copy: exactly one {@link Messages} entry per Supported_Language,
 * keyed by {@link Language} (design "Data Models"). French is the default; English is
 * served under the `/en/` routes. This is the single source of truth consumers read
 * from (migration of pages/components to it is handled by later tasks).
 */
export const MESSAGES: LocalizedContent = {
  fr: FR,
  en: EN,
};

/**
 * Resolve the {@link Messages} for a Supported_Language.
 *
 * Pure helper — no side effects — so components and tests share one accessor and the
 * per-language route rendering reads from the matching entry (Requirement 7.6).
 *
 * @param language the active Supported_Language
 * @returns that language's complete {@link Messages}
 */
export function getMessages(language: Language): Messages {
  return MESSAGES[language];
}
