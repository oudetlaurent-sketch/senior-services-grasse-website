/**
 * Shared domain types for the Senior Services Website.
 *
 * These definitions follow the design's "Data Models" and "Components and Interfaces"
 * sections verbatim. They are framework-free and side-effect-free so the pure domain
 * layer (validation, navigation, heading-structure, form-link helpers) and the
 * integration layer (EmailSender, FailedNotificationStore) can share one source of
 * truth and be exercised by property-based tests.
 *
 * Requirements traceability: 1.1 (static page/toolchain foundation), 2.2 (Service
 * content shape), 3.3 (navigation model) and the validation/notification contracts
 * used by Requirement 4.
 */

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Supported_Language for the bilingual site: French (default) and English
 * (design "Bilingual architecture", Requirement 7.1). The localized content model
 * (see src/content/i18n.ts) is keyed by this type.
 */
export type Language = "fr" | "en";

/**
 * Stable identifier for every page that appears in the Navigation_Menu.
 * The three service keys double as {@link ServiceKey} values. `about` and
 * `scheduling` identify the About_Page and Scheduling_Page added by the bilingual
 * redesign (design §1/§10/§11, Requirements 3.2, 11, 12).
 */
export type PageKey =
  | "home"
  | "computer-learning"
  | "computer-repair"
  | "in-home-repair"
  | "about"
  | "scheduling"
  | "service-request";

/** A single navigation entry. `title` is also the link label (Requirement 3.2). */
export type NavItem = {
  key: PageKey;
  title: string;
  href: string;
};

// ---------------------------------------------------------------------------
// Service content model (build-time)
// ---------------------------------------------------------------------------

/** Stable identifier for each of the three services (used in nav, URLs, form option). */
export type ServiceKey = "computer-learning" | "computer-repair" | "in-home-repair";

/**
 * Content entry describing one service. Exactly three entries exist, one per
 * {@link ServiceKey} (Requirement 2.1). `description` is non-empty and `includes`
 * carries at least one item (Requirement 2.2).
 */
export type Service = {
  key: ServiceKey; // stable identifier used in nav, URLs, and form option
  title: string; // display name, also used as nav/menu label
  description: string; // non-empty
  includes: string[]; // at least one item
};

/**
 * Per-language display content for one service (design "Data Models", `ServiceContent`).
 * The stable identifier is the {@link ServiceKey}; the display fields below are supplied
 * once per Supported_Language in the localized content model (see src/content/i18n.ts),
 * so the same service renders with the matching language's title/description/includes.
 * `description` is non-empty and `includes` carries at least one item (Requirement 2.2),
 * in each language. Values may contain accented characters (Requirement 7.6).
 */
export type ServiceContent = {
  title: string; // display name, also used as nav/menu label (per language)
  description: string; // non-empty (per language)
  includes: string[]; // at least one item (per language)
};

// ---------------------------------------------------------------------------
// Business identity and contact details (build-time content)
// ---------------------------------------------------------------------------

/**
 * Business identity and French-formatted contact details (design "Data Models",
 * "BusinessInfo and localized copy"). A single typed entry holds the name, phone,
 * email, and the French Service_Area statement, authored once and reused by the layout
 * footer, the Home_Page, and the Service_Request_Form.
 *
 * All string values are French. The business `name` is "Aide à la personne" — identical
 * in both languages, it is not translated (Requirement 10.1). `phone` is formatted in
 * the French convention (digits grouped in two-digit pairs, Requirement 7.9). The
 * site-wide contact details carry the phone and email only — no postal/street address
 * or postal code (Requirement 8.2). `serviceAreaStatement` is the single source for the
 * Grasse service-area wording shown on the Home_Page (8.1) and indicated on the form (8.3).
 */
export type BusinessInfo = {
  name: "Aide à la personne"; // business name, identical in both languages (Requirement 10.1)
  phone: string; // French-formatted phone, e.g. "06 13 06 13 06" (Requirement 7.9)
  email: string; // business email address
  serviceAreaStatement: string; // French statement of the Grasse Service_Area and surrounding towns
};

// ---------------------------------------------------------------------------
// Form input and validated records
// ---------------------------------------------------------------------------

/**
 * The untrusted strings as received from the form POST. All fields arrive as
 * strings; absence is normalized to an empty string before validation.
 */
export type RawFormInput = {
  name: string;
  phone: string;
  email: string;
  service: string;
  description: string;
};

/** Validated, normalized form input produced by `validateServiceRequest`. */
export type ServiceRequestInput = {
  name: string; // trimmed, 1-100 chars
  phone: string; // trimmed, 1-20 chars, allowed charset only
  email: string | null; // valid format or null when omitted
  service: ServiceKey; // one of the three keys
  description: string; // 0-2000 chars
};

/** Domain record created once a submission is accepted. */
export type ServiceRequest = ServiceRequestInput & {
  id: string; // generated unique id
  createdAt: string; // ISO 8601 timestamp
  notified: boolean; // false until a notification is confirmed delivered
};

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/** The email built from a {@link ServiceRequest} and handed to the transport. */
export type NotificationEmail = {
  to: string; // business email address
  subject: string; // e.g. "New service request: <service title>"
  body: string; // request details: name, phone, email, service, description, id, createdAt
};

// ---------------------------------------------------------------------------
// Validation results
// ---------------------------------------------------------------------------

/** Name of a form field that an error can be attributed to. */
export type FieldName = "name" | "phone" | "email" | "service" | "description";

/** Machine-readable validation error codes. */
export type ErrorCode =
  | "required"
  | "too_long"
  | "too_short"
  | "invalid_email"
  | "invalid_phone"
  | "unknown_service";

/** A single field-attributed validation error. */
export type FieldError = {
  field: FieldName;
  code: ErrorCode;
  message: string;
};

/**
 * Discriminated result of validating a {@link RawFormInput}. On success it carries the
 * normalized {@link ServiceRequestInput}; on failure it carries every applicable error
 * (validation never stops at the first error).
 */
export type ValidationResult =
  | { ok: true; value: ServiceRequestInput }
  | { ok: false; errors: FieldError[] };

// ---------------------------------------------------------------------------
// Localized content model (Messages / LocalizedContent) — build-time
// ---------------------------------------------------------------------------

/**
 * Content shape for the About_Page (design §10, `AboutContent`), held per language in
 * the localized content model. The `name` is always "Laurent Oudet" (Requirement 11.2);
 * `bio` is a short professional biography introducing him as an engineer
 * (Requirement 11.3). `provisional` is `true` while `bio` is placeholder copy and flips
 * to `false` once the final text is supplied — the swap is a content-only edit, no
 * structural change (Requirement 11.4). `photoAlt` is the per-language alt text for the
 * About photo of Laurent Oudet (Requirement 11.2); it stays meaningful even while the
 * photo asset itself is not yet supplied (see {@link ABOUT_PHOTO} in
 * src/domain/about-photo.ts).
 */
export type AboutContent = {
  name: "My Name";
  bio: string; // short professional biography (engineer)
  provisional: boolean; // true while bio is placeholder copy, false once final
  photoAlt: string; // meaningful alt text for the About photo of Laurent Oudet (per language)
};

/**
 * One Supported_Language's worth of every visitor-facing string (design "Data Models",
 * "Localized content model"). The same shape exists for `"fr"` and `"en"`, so each
 * static per-language route renders from the matching language's entries
 * (Requirement 7.6). The {@link PageKey}, {@link ServiceKey}, and {@link ErrorCode}
 * identifiers stay stable English machine keys; only the string values differ per
 * language.
 */
export type Messages = {
  // --- UI chrome / labels ---
  /** Nav + page titles in this language (Requirement 7.6). */
  nav: Record<PageKey, string>;
  /** Language_Selector option labels. */
  languageSelector: { fr: string; en: string };
  /**
   * Accessible group name for the Language_Selector in this language ("Langue" / "Language").
   * Used as the `aria-label` of the selector so assistive tech announces it as a language
   * chooser (Requirement 7.3).
   */
  languageSelectorLabel: string;
  /** The word "Email" — the same literal in both languages (Requirement 10.3). */
  emailLabel: "Email";
  /** Skip-link label ("skip to main content"). */
  skipLink: string;
  /** Footer contact-block labels in this language. */
  footer: {
    phoneLabel: string;
    emailLabel: "Email"; // the WORD "Email" in both languages (Requirement 10.3)
    // No address label: the site-wide contact details carry phone + email only, with no
    // postal/street address or postal code (Requirement 8.2).
    /** Grasse service-area statement in this language (Requirements 8.1, 8.3). */
    serviceAreaStatement: string;
  };

  // --- Page copy ---
  home: {
    /** The Home_Page title (document <title> + page <h1>), per language. */
    title: string;
    /** One-sentence business description (Requirement 1.2). */
    description: string;
    /** Page introduction / lead copy. */
    intro: string;
    /**
     * Hero_Banner copy in this language (design §2d "Visual landing-page template",
     * Requirement 16). The Home_Page opens with a prominent banner over a Grasse
     * photograph; the headline + supporting sentence carry the meaning (the photo is
     * decorative, Requirement 16.6) and the `cta` labels the primary call to action
     * linking to the Service_Request_Form (Requirements 16.1, 16.9).
     */
    hero: {
      /** The Hero_Banner headline, rendered as an `<h2>` so the single `<h1>` holds. */
      headline: string;
      /** A short supporting sentence beneath the headline. */
      tagline: string;
      /** The primary call-to-action link label (e.g. "Request a service"). */
      cta: string;
    };
    headings: {
      services: string;
      request: string;
      contact: string;
    };
  };
  /**
   * How_It_Works steps section copy in this language (design §2a, Requirement 13).
   * Rendered on the Home_Page as an `<h2>` + ordered list so a Visitor sees, in order,
   * how to engage the business.
   */
  howItWorks: {
    /** The section `<h2>` text ("Comment ça marche" / "How it works"). */
    heading: string;
    /**
     * The ordered steps, at least three, describing how to engage the business — e.g.
     * choose a service, send a request or book a meeting, be contacted. Their order is
     * the display order (Requirements 13.1, 13.2).
     */
    steps: string[];
  };
  /**
   * Reassurance_Element copy in this language (design §2b, Requirement 14). The `body`
   * identifies the person behind the business (Laurent Oudet) and the Grasse (06130)
   * Service_Area, and states that requesting a service or a meeting carries no
   * obligation and that the business will contact the Visitor to confirm
   * (Requirements 14.1, 14.2, 14.3).
   */
  reassurance: {
    /** Optional section heading (e.g. "En toute confiance" / "With confidence"). */
    heading?: string;
    /**
     * The reassurance body: names Laurent Oudet + the Grasse (06130) Service_Area and
     * states no-obligation + will-contact-to-confirm (Requirements 14.1, 14.3).
     */
    body: string;
  };
  /**
   * FAQ_Section copy in this language (design §2c, Requirement 15). Rendered on the
   * Home_Page as an `<h2>` + at least three question-and-answer pairs addressing common
   * senior-visitor concerns (Requirements 15.1, 15.2).
   */
  faq: {
    /** The section `<h2>` text ("Questions fréquentes" / "Frequently asked questions"). */
    heading: string;
    /** At least three Q&A pairs; both `question` and `answer` are non-empty (Requirement 15.1). */
    items: Array<{ question: string; answer: string }>;
  };
  /** Per-service title/description/includes in this language (Requirement 7.6). */
  services: Record<ServiceKey, ServiceContent>;
  /** About_Page name + (provisional) bio in this language (Requirement 11). */
  about: AboutContent;
  /** Scheduling_Page chrome in this language (Requirement 12.3). */
  scheduling: {
    heading: string;
    instructions: string;
    /** "online booking coming soon" copy (Requirement 12.5). */
    placeholder: string;
    /** Error wording shown with email + phone on embed load failure (Requirement 12.4). */
    errorFallback: string;
  };

  // --- Flows ---
  /** The on-screen Confirmation_Message in this language (Requirement 4.3). */
  confirmation: string;
  /** Validation error messages in this language, keyed by stable {@link ErrorCode}. */
  errors: Record<ErrorCode, string>;
};

/** The whole site's copy: exactly one {@link Messages} per Supported_Language. */
export type LocalizedContent = Record<Language, Messages>;
