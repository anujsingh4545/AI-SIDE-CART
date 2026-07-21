/*
 * Seed catalog for the AI Side Cart demo store.
 *
 * Purpose: give UCP + the assistant enough breadth and RICH descriptions to
 * test real semantic recommendation and intent matching:
 *   - Apparel / footwear carry pairing hints ("goes with denim", color cues)
 *     so the bot can reason about coordinating a black shirt with white sneakers.
 *   - Supplements / wellness describe conditions and benefits ("fall asleep
 *     faster", "post-workout recovery") so intent like "I can't sleep" maps to
 *     the right product.
 *   - Variants include COLORS and FLAVORS, not just sizes.
 *
 * All copy is invented demo data. Prices are the rupee amounts shown in the
 * India (INR) market. Edit freely and re-run `npm run seed:catalog`.
 */

// Shared option value sets
const APPAREL_SIZES = ["S", "M", "L", "XL"];
const SHOE_SIZES = ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"];

export const VENDOR = "AI Cart Demo";
export const TAG = "ai-cart-demo";

export const CATALOG = [
  // ---------------- APPAREL ----------------
  {
    title: "Classic Oxford Shirt",
    type: "Shirts",
    tags: ["apparel", "shirt", "smart casual"],
    price: 1799,
    body:
      "A crisp, breathable button-down in mid-weight Oxford cotton. Tailored but not tight, it works tucked in for the office or open over a tee on the weekend. The white and sky blue pair cleanly with navy chinos or dark denim, while the black is an easy match for light trousers or white sneakers.",
    options: [
      { name: "Color", values: ["White", "Sky Blue", "Black"] },
      { name: "Size", values: APPAREL_SIZES },
    ],
  },
  {
    title: "Linen Camp Collar Shirt",
    type: "Shirts",
    tags: ["apparel", "shirt", "summer", "linen"],
    price: 2199,
    body:
      "A relaxed open-collar shirt in pure washed linen that stays cool in peak summer heat. The sand and white shades are holiday staples with shorts, and the olive layers nicely over a plain tee. Naturally slubby texture and a soft, lived-in drape from the first wear.",
    options: [
      { name: "Color", values: ["Sand", "Olive", "White"] },
      { name: "Size", values: APPAREL_SIZES },
    ],
  },
  {
    title: "Merino Wool Crew Sweater",
    type: "Knitwear",
    tags: ["apparel", "sweater", "wool", "winter"],
    price: 3499,
    body:
      "A fine-gauge crew-neck knit in temperature-regulating merino wool that is warm without bulk and resists odour on long days. Charcoal and forest sit well under a denim or wool jacket, while camel dresses up easily with a collared shirt underneath. Soft enough to wear next to skin.",
    options: [
      { name: "Color", values: ["Charcoal", "Camel", "Forest"] },
      { name: "Size", values: APPAREL_SIZES },
    ],
  },
  {
    title: "Performance Pique Polo",
    type: "Shirts",
    tags: ["apparel", "polo", "activewear"],
    price: 1599,
    body:
      "A moisture-wicking polo in a stretch pique that moves with you on and off the course. Quick-drying and wrinkle-resistant, it holds its shape through travel and washing. Navy and black are versatile with chinos; the red adds a pop with neutral shorts.",
    options: [
      { name: "Color", values: ["Black", "White", "Navy", "Red"] },
      { name: "Size", values: [...APPAREL_SIZES, "XXL"] },
    ],
  },
  {
    title: "Selvedge Denim Jacket",
    type: "Outerwear",
    tags: ["apparel", "jacket", "denim"],
    price: 4299,
    compareAt: 4999,
    body:
      "A structured trucker jacket in raw selvedge denim that fades to your own pattern over time. Indigo is the classic layer over a white tee and sneakers; washed black leans more evening-ready. A true year-round third piece.",
    options: [
      { name: "Color", values: ["Indigo", "Washed Black"] },
      { name: "Size", values: APPAREL_SIZES },
    ],
  },

  // ---------------- FOOTWEAR ----------------
  {
    title: "Minimalist Leather Sneakers",
    type: "Footwear",
    tags: ["footwear", "sneakers", "everyday"],
    price: 3999,
    body:
      "Clean, low-profile leather sneakers built to go with almost anything. The white pair is the classic move with a black shirt or dark denim for sharp contrast, off-white reads softer with earth tones, and the all-black keeps a monochrome outfit sleek. Cushioned insole for all-day city wear.",
    options: [
      { name: "Color", values: ["White", "Off-White", "Black"] },
      { name: "Size", values: SHOE_SIZES },
    ],
  },
  {
    title: "Suede Chukka Boots",
    type: "Footwear",
    tags: ["footwear", "boots", "smart casual"],
    price: 4999,
    body:
      "A refined ankle boot in soft suede with a crepe sole for grip and comfort. Tan warms up blue denim and chinos; chocolate pairs with olive and charcoal for autumn layering. Dresses up jeans without tipping into formal.",
    options: [
      { name: "Color", values: ["Tan", "Chocolate"] },
      { name: "Size", values: SHOE_SIZES },
    ],
  },
  {
    title: "Canvas Slip-Ons",
    type: "Footwear",
    tags: ["footwear", "slip-on", "summer"],
    price: 1899,
    body:
      "Lightweight cotton-canvas slip-ons for warm days and quick errands. Navy and black keep things low-key with shorts, while stone brightens a summer linen look. Flexible sole that packs flat for travel.",
    options: [
      { name: "Color", values: ["Navy", "Black", "Stone"] },
      { name: "Size", values: SHOE_SIZES },
    ],
  },

  // ---------------- SUPPLEMENTS / WELLNESS ----------------
  {
    title: "Melatonin Sleep Gummies",
    type: "Supplements",
    tags: ["supplements", "sleep", "wellness"],
    price: 699,
    body:
      "If you struggle to switch off at night, these 3mg melatonin gummies help you fall asleep faster and settle into a steadier rhythm, so mornings feel less groggy. Non-habit forming, with calming botanicals like chamomile and lemon balm. Take one about 30 minutes before bed.",
    options: [{ name: "Flavor", values: ["Wild Berry", "Mixed Fruit"] }],
  },
  {
    title: "Magnesium Glycinate",
    type: "Supplements",
    tags: ["supplements", "sleep", "recovery", "wellness"],
    price: 899,
    body:
      "A gentle, highly absorbable form of magnesium that calms the nervous system and eases muscle tension. Good if you get night-time leg cramps, feel wired before bed, or want deeper, more restful sleep. Also supports post-training recovery.",
    options: [{ name: "Size", values: ["60 capsules", "120 capsules"] }],
  },
  {
    title: "Whey Protein Isolate",
    type: "Supplements",
    tags: ["supplements", "protein", "fitness", "recovery"],
    price: 2799,
    body:
      "A fast-absorbing whey isolate with 25g of protein per scoop and minimal lactose, made for muscle repair after training. Mixes smooth with water or milk without clumping. Reach for it within an hour of a workout to support recovery and lean growth.",
    options: [{ name: "Flavor", values: ["Chocolate", "Vanilla", "Strawberry"] }],
  },
  {
    title: "Plant Protein Blend",
    type: "Supplements",
    tags: ["supplements", "protein", "vegan", "fitness"],
    price: 2499,
    body:
      "A complete vegan protein from pea and brown rice with a full amino acid profile and 22g per serving. Easy on digestion and dairy-free, it is a solid recovery option if whey does not agree with you. Unflavored blends into smoothies without changing the taste.",
    options: [{ name: "Flavor", values: ["Chocolate", "Unflavored"] }],
  },
  {
    title: "Daily Multivitamin",
    type: "Supplements",
    tags: ["supplements", "wellness", "immunity", "energy"],
    price: 799,
    body:
      "A once-a-day multivitamin that fills the gaps a busy diet misses, with a balanced mix of A to zinc for everyday energy and immune support. Handy if your meals are irregular or you travel a lot. Best taken with food in the morning.",
    options: [{ name: "Size", values: ["30 count", "60 count"] }],
  },
  {
    title: "Vitamin D3 + K2 Drops",
    type: "Supplements",
    tags: ["supplements", "immunity", "mood", "wellness"],
    price: 649,
    body:
      "Sunshine in a bottle for anyone short on daylight. D3 paired with K2 supports immunity, mood and bone strength, and directs calcium where it belongs. A few drops in the morning is all it takes, especially through cloudy months or desk-bound weeks.",
  },
  {
    title: "Ashwagandha KSM-66",
    type: "Supplements",
    tags: ["supplements", "stress", "focus", "wellness"],
    price: 749,
    body:
      "A clinically studied ashwagandha extract that helps take the edge off stressful days and supports calm focus. Useful if you feel frazzled, run hot before bed, or want steadier energy without stimulants. Take daily for a few weeks to feel the full effect.",
    options: [{ name: "Size", values: ["60 capsules"] }],
  },
  {
    title: "Electrolyte Hydration Mix",
    type: "Supplements",
    tags: ["supplements", "hydration", "fitness", "wellness"],
    price: 999,
    body:
      "A sugar-light electrolyte mix with sodium, potassium and magnesium to rehydrate fast after sweat, long workouts, travel, or a heavy night out. Just add one stick to water. Crisp fruit flavors make it easy to actually drink enough.",
    options: [{ name: "Flavor", values: ["Lemon", "Orange", "Watermelon"] }],
  },
  {
    title: "Omega-3 Fish Oil",
    type: "Supplements",
    tags: ["supplements", "heart", "joints", "wellness"],
    price: 899,
    body:
      "High-strength EPA and DHA omega-3s that support heart, brain and joint health, with a lemon coating so there is no fishy aftertaste. A good daily baseline if your diet is light on oily fish. Supports mobility if your knees complain after runs.",
  },

  // ---------------- FOOD & BEVERAGE ----------------
  {
    title: "Cold Brew Coffee Concentrate",
    type: "Beverages",
    tags: ["food", "coffee", "beverage"],
    price: 549,
    body:
      "Smooth, low-acid cold brew concentrate for steady morning energy without the jittery spike. Cut it with water or milk over ice, or warm it up when it is cold out. One bottle makes about eight cups.",
  },
  {
    title: "Ceremonial Matcha Powder",
    type: "Beverages",
    tags: ["food", "tea", "beverage", "focus"],
    price: 1299,
    body:
      "Stone-ground ceremonial matcha that delivers calm, focused energy from natural caffeine balanced by L-theanine, so you get alertness without the crash. Whisk with hot water or fold into a latte. A gentler swap if coffee leaves you anxious.",
  },
  {
    title: "Protein Bars (Box of 12)",
    type: "Snacks",
    tags: ["food", "protein", "snack", "fitness"],
    price: 1199,
    body:
      "A box of chewy bars with 20g of protein and no artificial sweeteners, built for a real post-gym snack or a desk-drawer lunch backup. Satisfying enough to hold off cravings between meals. Great alongside a protein shake on heavy training days.",
    options: [{ name: "Flavor", values: ["Peanut Butter", "Cookies & Cream", "Choc Sea Salt"] }],
  },
  {
    title: "Granola Clusters",
    type: "Snacks",
    tags: ["food", "breakfast", "snack"],
    price: 499,
    body:
      "Crunchy oat clusters baked with nuts and a hint of honey, low in refined sugar. Eat them with milk or yogurt, or snack them by the handful. An easy breakfast that pairs well with the cold brew for slow mornings.",
    options: [{ name: "Flavor", values: ["Almond Honey", "Dark Cacao"] }],
  },
  {
    title: "Sparkling Electrolyte Water (12-pack)",
    type: "Beverages",
    tags: ["food", "hydration", "beverage"],
    price: 899,
    body:
      "Lightly sparkling water with a pinch of electrolytes and zero sugar, for everyday hydration that is more interesting than plain water. Crisp citrus and berry flavors. Keep a can at your desk or grab one after a workout.",
    options: [{ name: "Flavor", values: ["Lime", "Grapefruit", "Berry"] }],
  },

  // ---------------- ACCESSORIES ----------------
  {
    title: "Everyday Commuter Backpack",
    type: "Accessories",
    tags: ["accessories", "bag", "travel", "work"],
    price: 3299,
    body:
      "A clean, water-resistant backpack with a padded 16-inch laptop sleeve and a quick-grab top pocket. Structured enough for the office, comfortable enough for travel. Black and grey keep it professional; olive adds a bit of character.",
    options: [{ name: "Color", values: ["Black", "Grey", "Olive"] }],
  },
  {
    title: "Merino Crew Socks (3-pack)",
    type: "Accessories",
    tags: ["accessories", "socks", "wool"],
    price: 699,
    body:
      "Cushioned merino-blend crew socks that regulate temperature and resist odour on long days or hikes. Soft, breathable, and hard-wearing at the heel and toe. The mixed pack covers everything from sneakers to boots.",
    options: [
      { name: "Color", values: ["Black", "Grey", "Mixed"] },
      { name: "Size", values: ["M", "L"] },
    ],
  },
  {
    title: "Polarized Sunglasses",
    type: "Accessories",
    tags: ["accessories", "eyewear", "summer"],
    price: 1999,
    body:
      "Lightweight polarized sunglasses that cut glare on bright days and drives. A timeless silhouette that suits most face shapes. Matte black is the safe everyday pick, tortoise warms up neutrals, and silver leans sporty.",
    options: [{ name: "Color", values: ["Matte Black", "Tortoise", "Silver"] }],
  },
  {
    title: "Insulated Steel Water Bottle",
    type: "Accessories",
    tags: ["accessories", "hydration", "bottle"],
    price: 1099,
    body:
      "A double-walled stainless bottle that keeps drinks cold for 24 hours or hot for 12. Leak-proof lid and a slim profile that fits most cup holders and bag pockets. Pairs naturally with the electrolyte mix for gym days.",
    options: [{ name: "Color", values: ["Black", "White", "Sage", "Coral"] }],
  },
  {
    title: "Ribbed Beanie",
    type: "Accessories",
    tags: ["accessories", "hat", "winter"],
    price: 599,
    body:
      "A soft ribbed-knit beanie with a snug, non-itchy fit for cold mornings and commutes. Neutral shades layer over almost any jacket. Charcoal and navy stay understated; oatmeal lightens a dark winter outfit.",
    options: [{ name: "Color", values: ["Charcoal", "Oatmeal", "Navy"] }],
  },
];
