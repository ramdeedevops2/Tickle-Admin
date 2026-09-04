/**
 * Google's place types, with a recommendation for each.
 *
 * Venue rules are the most consequential list in this panel — allowing a
 * category means a stranger can be pointed at a place and told somebody
 * is there. That is fine for a café and is not fine for a clinic, a
 * school, a women's shelter or the block somebody lives on.
 *
 * The admin is not expected to hold Google's taxonomy in their head, and
 * nobody should be relied on to remember that `physiotherapist` is a
 * medical type at four in the afternoon. So each type carries a verdict
 * and, more importantly, a reason — a recommendation somebody can
 * disagree with is useful, a bare "blocked" is not.
 *
 * This is a static list rather than an API call. Google's type taxonomy
 * is a fixed vocabulary published with the Places API; fetching it would
 * add a network dependency, a key, and a failure mode to a lookup table
 * that changes about once a year.
 */

export type Verdict = "block" | "allow" | "review";

export type PlaceTypeRule = {
  /** Why, in words the admin can weigh rather than defer to. */
  reason: string;
  verdict: Verdict;
};

/**
 * Categories of harm, each with the reasoning written once.
 *
 * Grouped this way so the rationale stays consistent: every medical type
 * is blocked for the same stated reason, and a new one added next year
 * inherits it rather than getting a fresh ad-hoc justification.
 */
const REASONS = {
  health:
    "Being findable here reveals a medical condition. Someone's health is not ours to disclose.",
  religion:
    "Reveals faith, and religious buildings are somewhere people expect to be left alone.",
  minors:
    "Children are present. Directing adult strangers here is not defensible under any setting.",
  home: "Where people live. A heart here points strangers at somebody's address.",
  captive:
    "People here cannot leave freely, so they cannot walk away from unwanted attention.",
  crisis:
    "People here are already vulnerable, often fleeing someone. Findability is the specific danger.",
  legal:
    "Reveals involvement with the law — as accused, victim or witness. None of it is ours to expose.",
  work: "Somebody's workplace. They cannot leave, and being approached there follows them.",
  adult:
    "Adult venue. Allowing it invites the kind of attention the rest of these rules exist to prevent.",
  social:
    "A public social place people choose to be seen in. This is what the feature is for.",
} as const;

/** The lookup. Anything absent is `review`. */
export const PLACE_TYPE_RULES: Record<string, PlaceTypeRule> = {};

function define(verdict: Verdict, reason: string, types: string[]) {
  for (const type of types) PLACE_TYPE_RULES[type] = { verdict, reason };
}

// ─── Never ───────────────────────────────────────────────

define("block", REASONS.health, [
  "hospital", "doctor", "dentist", "pharmacy", "drugstore", "physiotherapist",
  "medical_lab", "health", "veterinary_care", "clinic", "chiropractor",
  "psychologist", "psychiatrist", "wellness_center", "sauna", "spa",
]);

define("block", REASONS.religion, [
  "church", "mosque", "synagogue", "hindu_temple", "place_of_worship",
  "cemetery", "funeral_home", "crematorium",
]);

define("block", REASONS.minors, [
  "school", "primary_school", "secondary_school", "preschool",
  "child_care_agency", "playground", "amusement_park", "zoo", "aquarium",
]);

define("block", REASONS.home, [
  "apartment_complex", "apartment_building", "residential_area",
  "housing_complex", "gated_community", "condominium_complex",
]);

define("block", REASONS.captive, [
  "prison", "correctional_facility", "detention_center", "nursing_home",
  "assisted_living_facility", "hospice",
]);

define("block", REASONS.crisis, [
  "homeless_shelter", "womens_shelter", "shelter", "welfare_office",
  "social_services", "food_bank", "rehabilitation_center",
]);

define("block", REASONS.legal, [
  "police", "courthouse", "lawyer", "local_government_office",
  "embassy", "city_hall", "immigration_office",
]);

define("block", REASONS.adult, [
  "night_club_adult", "adult_entertainment_store", "strip_club", "casino",
]);

// ─── Usually fine ────────────────────────────────────────

define("allow", REASONS.social, [
  "cafe", "coffee_shop", "restaurant", "bar", "pub", "bakery", "bistro",
  "night_club", "brewery", "wine_bar", "tea_house", "ice_cream_shop",
  "dessert_shop", "juice_shop", "book_store", "library", "art_gallery",
  "museum", "movie_theater", "concert_hall", "performing_arts_theater",
  "tourist_attraction", "park", "garden", "beach", "plaza", "market",
  "shopping_mall", "bowling_alley", "stadium", "arena", "gym",
  "fitness_center", "yoga_studio", "climbing_gym", "sports_complex",
  "event_venue", "banquet_hall", "comedy_club", "karaoke",
]);

// ─── Needs a human ───────────────────────────────────────

define("review", "Depends on the specific venue — some are public and social, some are not.", [
  "lodging", "hotel", "motel", "hostel", "resort_hotel", "campground",
  "university", "college", "transit_station", "train_station",
  "bus_station", "subway_station", "airport", "parking", "bank", "atm",
  "storage", "gas_station", "car_repair", "hair_salon", "barber_shop",
  "beauty_salon", "nail_salon", "laundry", "post_office",
]);

/**
 * What to do about a category, including ones not in the table.
 *
 * The substring fallback is the important half: Google adds types
 * regularly, and a new one called `childrens_hospital` should be caught
 * as medical rather than fall through as unknown. It errs toward
 * blocking, which is the safe direction — a wrongly blocked café costs a
 * venue, a wrongly allowed clinic costs somebody their privacy.
 */
export function classify(category: string): PlaceTypeRule & { exact: boolean } {
  const key = category.trim().toLowerCase().replace(/[\s-]+/g, "_");

  const exact = PLACE_TYPE_RULES[key];
  if (exact) return { ...exact, exact: true };

  const CONTAINS: [string[], keyof typeof REASONS][] = [
    [["hospital", "clinic", "medical", "doctor", "health", "dental", "pharma", "therap", "surgeon", "diagnostic"], "health"],
    [["school", "kinder", "child", "nursery", "daycare", "playgroup", "tuition"], "minors"],
    [["temple", "church", "mosque", "worship", "shrine", "gurudwara", "chapel"], "religion"],
    [["prison", "jail", "detention", "correctional"], "captive"],
    [["shelter", "refuge", "crisis", "rehab"], "crisis"],
    [["police", "court", "embassy", "government"], "legal"],
    [["apartment", "residence", "residential", "housing"], "home"],
  ];

  for (const [needles, reasonKey] of CONTAINS) {
    if (needles.some((needle) => key.includes(needle))) {
      return { verdict: "block", reason: REASONS[reasonKey], exact: false };
    }
  }

  return {
    verdict: "review",
    reason:
      "Not a type we have a rule for. It stays blocked until somebody decides, which is the safe default.",
    exact: false,
  };
}

/** Verdicts, for rendering. */
export const VERDICT_COPY: Record<Verdict, { label: string; tone: "success" | "destructive" | "warning" }> = {
  allow: { label: "Suggest allowing", tone: "success" },
  block: { label: "Suggest blocking", tone: "destructive" },
  review: { label: "Needs a decision", tone: "warning" },
};
