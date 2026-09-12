import { NextRequest, NextResponse } from "next/server";
import { failed, getServiceClient, requireAdmin } from "@/lib/supabase/admin";

/**
 * Making a test profile from a folder of photographs.
 *
 * Filling a profile by hand takes twenty fields and ten minutes, and a
 * deck needs dozens of them before it behaves like a real deck — so
 * every test so far has run against profiles that are half empty in
 * ways real ones never are.
 *
 * This takes a name and some images and writes a whole person: an auth
 * user, a profile row, the photos in the bucket, and every field the
 * app reads. The fields are dealt from pools rather than repeated, so
 * ten profiles made this way look like ten people rather than one
 * person typed ten times.
 *
 * ── Seeded, not random ─────────────────────────────────────────
 *
 * The pools are indexed by a hash of the name, so the same name always
 * produces the same person. Re-running after a failure gives the same
 * profile rather than a different one, and a name you have seen in the
 * deck is the name you can go back and find.
 *
 * ── What this is not ───────────────────────────────────────────
 *
 * It is a test-data tool. Everything it makes carries a @tickle.seed
 * address, which is what the purge below matches on — nothing here can
 * touch a real member's account.
 */

/** Every seeded account ends in this, and purging matches on it. */
const SEED_DOMAIN = "@tickle.seed";

/*
 * The region the app is being built for.
 *
 * Real coordinates in each city, so the distance a card shows is a
 * plausible number rather than zero or half the country.
 */
const PLACES = [
  { city: "Chandigarh", lat: 30.741482, lng: 76.768066 },
  { city: "Chandigarh", lat: 30.733315, lng: 76.779419 },
  { city: "Chandigarh", lat: 30.752300, lng: 76.792397 },
  { city: "Mohali", lat: 30.704649, lng: 76.717873 },
  { city: "Mohali", lat: 30.712870, lng: 76.694489 },
  { city: "Panchkula", lat: 30.695020, lng: 76.854149 },
  { city: "Panchkula", lat: 30.688751, lng: 76.861893 },
  { city: "Zirakpur", lat: 30.642334, lng: 76.822540 },
];

const HOMETOWNS = [
  "Ludhiana", "Amritsar", "Patiala", "Jalandhar", "Shimla",
  "Dehradun", "Karnal", "Bathinda", "Hoshiarpur", "Srinagar",
  "Nagpur", "Jammu", "Ambala", "Solan", "Pathankot",
];

/*
 * Work paired with where it was studied.
 *
 * Kept together because the pair has to make sense — a resident doctor
 * who studied at a design college reads as generated, which is the one
 * thing this tool exists to avoid.
 */
const CAREERS = [
  { work: "Interior designer", education: "Chandigarh College of Architecture", level: "Undergraduate degree" },
  { work: "Physiotherapist", education: "Baba Farid University", level: "Graduate degree" },
  { work: "Primary school teacher", education: "Panjab University", level: "Graduate degree" },
  { work: "Financial analyst", education: "Punjabi University", level: "Graduate degree" },
  { work: "Architect", education: "Guru Nanak Dev University", level: "Graduate degree" },
  { work: "Veterinary surgeon", education: "GADVASU Ludhiana", level: "Graduate degree" },
  { work: "Content designer", education: "Panjab University", level: "Undergraduate degree" },
  { work: "Chartered accountant", education: "ICAI", level: "Graduate degree" },
  { work: "Resident doctor", education: "GMCH Chandigarh", level: "Graduate degree" },
  { work: "UX researcher", education: "Thapar University", level: "Graduate degree" },
  { work: "Journalist", education: "Panjab University", level: "Graduate degree" },
  { work: "Dentist", education: "Dr Harvansh Singh Judge Institute", level: "Graduate degree" },
  { work: "Clinical psychologist", education: "PGIMER Chandigarh", level: "Graduate degree" },
  { work: "Product manager", education: "Thapar University", level: "Graduate degree" },
  { work: "Lawyer", education: "Army Institute of Law", level: "Graduate degree" },
];

const BIOS = [
  "Sector 17 for work, Sukhna for everything else.",
  "Will judge you gently for putting sugar in filter coffee.",
  "Half my camera roll is the lake at 6am. The other half is receipts.",
  "Bhangra at weddings, jazz at home. Both are true.",
  "Runs the Sukhna loop, walks everywhere else.",
  "Ask me about my filter coffee setup. Or don't.",
  "Mountains over beaches, always. Himachal is home.",
  "Looking for someone who also thinks Elante food court is underrated.",
  "Punjabi at home, chaos everywhere else.",
  "If I fall asleep mid-conversation it is the roster, not you.",
  "Phase 7 market is my whole personality.",
  "My phone is 90% photos of other people's dogs and I am not sorry.",
];

const INTERESTS = [
  "Coffee", "Painting", "Live gigs", "Thrifting", "Cycling",
  "Badminton", "Cooking", "Dogs", "Podcasts", "Street food",
  "Reading", "Baking", "Poetry", "Gardening", "Gym",
  "Travel", "Cricket", "Movies", "Photography", "Hiking",
  "Running", "Trekking", "Dancing", "Gaming", "Cats",
];

const CAUSES = [
  "Environment", "Animal welfare", "Mental health", "Education",
  "Women's rights", "Human rights", "Community service", "Arts and culture",
];

const QUALITIES = [
  "Curiosity", "Honesty", "Patience", "Warmth", "Consistency",
  "Humour", "Kindness", "Loyalty", "Ambition", "Directness",
  "Creativity", "Independence", "Empathy", "Playfulness", "Resilience",
];

const LANGUAGE_SETS = [
  ["Hindi", "English"],
  ["Hindi", "Punjabi", "English"],
  ["Punjabi", "Hindi", "English"],
  ["Hindi", "English", "Marathi"],
  ["Urdu", "Hindi", "English"],
  ["Hindi", "English", "Garhwali"],
];

const PROMPT_POOL = [
  { question: "My most controversial opinion is", answers: [
    "Chandigarh food peaked with the dhabas on the highway",
    "Zirakpur is better than Chandigarh. The rent alone.",
    "Night shifts are better than mornings and I will not be arguing",
    "Pineapple belongs on pizza",
  ]},
  { question: "The way to win me over is", answers: [
    "Send me a photo of something you built or fixed yourself",
    "Be on time. Genuinely, that is it.",
    "Feed me. That is the entire strategy.",
    "Plan something without asking me to plan it.",
  ]},
  { question: "I get way too excited about", answers: [
    "Empty parking lots. Perfect grid. No notes.",
    "The first proper cold morning in November",
    "Good natural light. I will move us to another table for it.",
    "A really good subject line. It is a whole craft.",
  ]},
  { question: "The last thing that made me laugh", answers: [
    "A patient telling me his back hurt from thinking too hard",
    "A very confident wrong answer in a meeting",
    "A client asking for something like the Taj but modern",
    "A user calling the search bar the asking box",
  ]},
  { question: "My texting style is best described as", answers: [
    "Voice notes. Sorry in advance.",
    "Memes, mostly. Words when necessary.",
    "Three messages where one would do",
    "Fast, then silent for a day. No pattern.",
  ]},
  { question: "You should not go out with me if", answers: [
    "You cannot handle being beaten at anything",
    "You are not prepared to meet every dog on the walk",
    "Punctuality means nothing to you",
    "You need a plan for Sunday by Wednesday",
  ]},
];

/*
 * Sample media, so the players actually run.
 *
 * Each duration is the real length of the file it points at, so the
 * progress bar tracks honestly rather than counting to a number that
 * does not exist. Replace with real recordings when there are any —
 * the app's playableUrl() takes a URL or a bucket path, so it is a
 * column update and no code change.
 */
const VOICE_CLIPS = [
  { url: "https://samplelib.com/lib/preview/mp3/sample-6s.mp3", seconds: 6 },
  { url: "https://samplelib.com/lib/preview/mp3/sample-9s.mp3", seconds: 9 },
  { url: "https://samplelib.com/lib/preview/mp3/sample-12s.mp3", seconds: 12 },
  { url: "https://samplelib.com/lib/preview/mp3/sample-15s.mp3", seconds: 15 },
];

const VOICE_QUESTIONS = [
  "What I am actually like",
  "My most useless talent",
  "The way to win me over",
  "Something I could talk about for hours",
];

const VIDEO = { url: "https://samplelib.com/lib/preview/mp4/sample-10s.mp4", seconds: 10 };

const EXERCISE = ["Active", "Sometimes", "Almost never"];
const DRINKING = ["Yes, I drink", "No, I don't drink", "Sometimes"];
const SMOKING = ["No, I don't smoke", "Trying to quit", "Sometimes"];
const LOOKING_FOR = ["A relationship", "Open to seeing where things go", "Not sure yet"];
const KIDS = ["Want someday", "Open to it", "Not sure yet", "Don't want"];
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const RELIGIONS = ["Hindu", "Sikh", "Muslim", "Spiritual", "Prefer not to say"];
const POLITICS = ["Moderate", "Liberal", "Prefer not to say"];

/**
 * A number from a string, so the same name always makes the same person.
 *
 * Re-running after a partial failure gives the profile back rather than
 * a different one, and a name seen in the deck can be found again.
 */
function seedOf(text: string): number {
  let hash = 0;

  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }

  return hash;
}

/** One item from a pool, chosen by the seed rather than at random. */
function pick<T>(pool: T[], seed: number, offset: number): T {
  return pool[(seed + offset * 7919) % pool.length];
}

/** Several distinct items, walking the pool so none repeat. */
function pickMany<T>(pool: T[], seed: number, offset: number, count: number): T[] {
  const out: T[] = [];
  let step = 0;

  while (out.length < count && step < pool.length * 2) {
    const item = pool[(seed + (offset + step) * 4111) % pool.length];

    if (!out.includes(item)) out.push(item);
    step += 1;
  }

  return out;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const form = await request.formData();

    const name = String(form.get("name") ?? "").trim();
    const age = Number(form.get("age") ?? 26);
    const files = form.getAll("photos").filter((f): f is File => f instanceof File);

    if (!name) {
      return NextResponse.json({ error: "A name is required." }, { status: 400 });
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "At least one photo is required." },
        { status: 400 },
      );
    }

    if (age < 18) {
      return NextResponse.json(
        { error: "Age must be 18 or over." },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();
    const seed = seedOf(name.toLowerCase());

    /*
     * The address is derived from the name, so a second run finds the
     * existing account rather than making a duplicate.
     */
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const email = `seed.${slug}${SEED_DOMAIN}`;

    // ── The auth user ────────────────────────────────────────────
    //
    // profiles.user_id is the id the whole app keys on, so this has to
    // exist before the profile does.
    const { data: created, error: userError } =
      await supabase.auth.admin.createUser({
        email,
        password: `seed-${seed}`,
        email_confirm: true,
      });

    let userId = created?.user?.id;

    if (userError) {
      /*
       * Already there, from an earlier run.
       *
       * Re-using it makes this endpoint safe to call twice — the photos
       * and fields are overwritten below, which is what somebody
       * re-uploading a folder means by it.
       */
      const { data: list } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      userId = list?.users?.find((u) => u.email === email)?.id;

      if (!userId) {
        return NextResponse.json(
          { error: `Could not create or find the account: ${userError.message}` },
          { status: 500 },
        );
      }
    }

    // ── The photographs ──────────────────────────────────────────
    //
    // Into the public photos bucket under the user's own id, which is
    // the layout the app and the existing seed both expect.
    const urls: string[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const extension = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${userId}/photo-${i}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        return NextResponse.json(
          { error: `Photo ${i + 1} failed to upload: ${uploadError.message}` },
          { status: 500 },
        );
      }

      const { data: pub } = supabase.storage.from("photos").getPublicUrl(path);

      urls.push(pub.publicUrl);
    }

    // ── The person ───────────────────────────────────────────────
    const place = pick(PLACES, seed, 1);
    const career = pick(CAREERS, seed, 2);

    /*
     * Three prompts from three different questions.
     *
     * Walking the pool rather than picking at random, so no profile
     * asks the same question twice — which is the tell that gives a
     * generated profile away fastest.
     */
    const prompts = pickMany(PROMPT_POOL, seed, 3, 3).map((entry, i) => ({
      question: entry.question,
      answer: entry.answers[(seed + i * 13) % entry.answers.length],
    }));

    const voiceCount = 1 + (seed % 2);

    const voicePrompts = Array.from({ length: voiceCount }, (_, i) => {
      const clip = pick(VOICE_CLIPS, seed, 20 + i);

      return {
        question: pick(VOICE_QUESTIONS, seed, 30 + i),
        path: clip.url,
        duration: clip.seconds,
      };
    });

    const profile = {
      user_id: userId,
      email,
      name,
      age,
      gender: "female",
      interested_in: "male",
      orientation: "Straight",
      bio: pick(BIOS, seed, 4),
      photos: urls,
      city: place.city,
      hometown: pick(HOMETOWNS, seed, 5),
      latitude: place.lat,
      longitude: place.lng,
      search_radius: 25 + (seed % 20),
      work: career.work,
      education: career.education,
      education_level: career.level,
      height_cm: 155 + (seed % 15),
      exercise: pick(EXERCISE, seed, 6),
      drinking: pick(DRINKING, seed, 7),
      smoking: pick(SMOKING, seed, 8),
      looking_for: pick(LOOKING_FOR, seed, 9),
      kids: pick(KIDS, seed, 10),
      have_kids: "Don't have kids",
      star_sign: pick(SIGNS, seed, 11),
      religion: pick(RELIGIONS, seed, 12),
      politics: pick(POLITICS, seed, 13),
      pronouns: ["she/her"],
      languages: pick(LANGUAGE_SETS, seed, 14),
      interests: pickMany(INTERESTS, seed, 15, 5),
      causes: pickMany(CAUSES, seed, 16, 2),
      qualities: pickMany(QUALITIES, seed, 17, 3),
      prompts,
      voice_prompts: voicePrompts,
      profile_video: VIDEO.url,
      video_duration_s: VIDEO.seconds,
      onboarding_done: true,
      published_at: new Date().toISOString(),
      phone_verified_at: new Date().toISOString(),
      email_verified_at: new Date().toISOString(),
      face_verified_at: new Date().toISOString(),
      is_online: false,
      last_active: new Date().toISOString(),
    };

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(profile, { onConflict: "user_id" });

    if (profileError) {
      return NextResponse.json(
        { error: `Profile failed to save: ${profileError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      profile: {
        name,
        age,
        city: place.city,
        work: career.work,
        photos: urls.length,
        userId,
      },
    });
  } catch (error) {
    return failed(error, "Could not create the profile.");
  }
}

/**
 * Every profile this tool has made, and a way to remove them.
 *
 * Matching on the seed domain is what makes the delete safe: a real
 * member's account cannot end in @tickle.seed, so nothing here can
 * reach one.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, name, age, city, work, photos, created_at")
      .like("email", `%${SEED_DOMAIN}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ profiles: data ?? [] });
  } catch (error) {
    return failed(error, "Could not load the seeded profiles.");
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "A userId is required." }, { status: 400 });
    }

    const supabase = getServiceClient();

    /*
     * Checked before deleting, not after.
     *
     * The id comes from the client, and an id is easy to substitute —
     * so the seed domain is confirmed against the database before
     * anything is removed, rather than trusting what was sent.
     */
    const { data: row } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();

    if (!row?.email?.endsWith(SEED_DOMAIN)) {
      return NextResponse.json(
        { error: "That account was not made by this tool." },
        { status: 400 },
      );
    }

    // The profile row goes with the user: profiles.user_id cascades.
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Could not remove the profile.");
  }
}
