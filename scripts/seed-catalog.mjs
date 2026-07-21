/*
 * Seed the demo store from scripts/catalog.mjs — zero AI cost, re-runnable.
 *
 * Usage:
 *   1. Put an Admin API access token in .env:
 *        SHOPIFY_ADMIN_TOKEN=shpat_xxx        (scopes: write_products, write_publications)
 *        SHOPIFY_STORE_DOMAIN=rohanp-test.myshopify.com   (already set)
 *   2. npm run seed:catalog
 *
 * It is idempotent: products whose title already exists (tagged ai-cart-demo)
 * are skipped, so re-running only adds what is missing. Pass --force to create
 * duplicates anyway.
 *
 * Each product is created ACTIVE, published to the Online Store, with variants
 * built from the catalog's option sets (Color / Size / Flavor) and inventory
 * left untracked so everything is purchasable (and visible via UCP).
 */
import "dotenv/config";
import { CATALOG, VENDOR, TAG } from "./catalog.mjs";

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API = "2026-10";
const FORCE = process.argv.includes("--force");

if (!DOMAIN || !TOKEN) {
  console.error(
    "Missing env. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN in .env.\n" +
      "Create the token in Shopify admin > Settings > Apps and sales channels >\n" +
      "Develop apps > (your app) > Admin API access token. Scopes: write_products, write_publications.",
  );
  process.exit(1);
}

const ENDPOINT = `https://${DOMAIN}/admin/api/${API}/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

/** Cartesian product of option value lists -> array of {OptionName: value} maps. */
function expandVariants(options) {
  if (!options || !options.length) return [{}];
  return options.reduce(
    (acc, opt) => acc.flatMap((combo) => opt.values.map((v) => ({ ...combo, [opt.name]: v }))),
    [{}],
  );
}

async function onlineStorePublicationId() {
  const data = await gql(`{ publications(first: 25) { nodes { id name } } }`);
  const nodes = data.publications.nodes;
  const os = nodes.find((n) => /online store/i.test(n.name || ""));
  return (os || nodes[0] || {}).id || null;
}

async function existingTitles() {
  const titles = new Set();
  let after = null;
  do {
    const data = await gql(
      `query($q:String!,$after:String){ products(first:100, query:$q, after:$after){ nodes{ title } pageInfo{ hasNextPage endCursor } } }`,
      { q: `tag:${TAG}`, after },
    );
    data.products.nodes.forEach((n) => titles.add(n.title));
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  return titles;
}

const PRODUCT_SET = `
  mutation Set($input: ProductSetInput!) {
    productSet(synchronous: true, input: $input) {
      product { id title variantsCount { count } }
      userErrors { field message }
    }
  }`;

const PUBLISH = `
  mutation Pub($id: ID!, $pubs: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $pubs) { userErrors { field message } }
  }`;

function buildInput(p) {
  const productOptions = (p.options || []).map((o) => ({
    name: o.name,
    values: o.values.map((v) => ({ name: v })),
  }));
  const variants = expandVariants(p.options).map((combo) => {
    const optionValues = Object.entries(combo).map(([optionName, name]) => ({ optionName, name }));
    return {
      ...(optionValues.length ? { optionValues } : {}),
      price: String(p.price),
      ...(p.compareAt ? { compareAtPrice: String(p.compareAt) } : {}),
      inventoryItem: { tracked: false },
      inventoryPolicy: "CONTINUE",
    };
  });
  return {
    title: p.title,
    descriptionHtml: `<p>${p.body}</p>`,
    vendor: VENDOR,
    productType: p.type || "",
    status: "ACTIVE",
    tags: [TAG, ...(p.tags || [])],
    ...(productOptions.length ? { productOptions } : {}),
    variants,
  };
}

async function run() {
  console.log(`Seeding ${CATALOG.length} products to ${DOMAIN} ...`);
  const pubId = await onlineStorePublicationId();
  if (!pubId) console.warn("! Could not find an Online Store publication; products may stay unpublished.");
  const have = FORCE ? new Set() : await existingTitles();

  let created = 0, skipped = 0, failed = 0;
  for (const p of CATALOG) {
    if (have.has(p.title)) { console.log(`- skip (exists): ${p.title}`); skipped++; continue; }
    try {
      const data = await gql(PRODUCT_SET, { input: buildInput(p) });
      const errs = data.productSet.userErrors;
      if (errs && errs.length) throw new Error(errs.map((e) => `${e.field}: ${e.message}`).join("; "));
      const prod = data.productSet.product;
      if (pubId) {
        const pub = await gql(PUBLISH, { id: prod.id, pubs: [{ publicationId: pubId }] });
        const perr = pub.publishablePublish.userErrors;
        if (perr && perr.length) console.warn(`  ! publish warning for ${p.title}: ${JSON.stringify(perr)}`);
      }
      console.log(`+ created: ${p.title}  (${prod.variantsCount?.count ?? "?"} variants)`);
      created++;
    } catch (e) {
      console.error(`x failed: ${p.title} -> ${e.message}`);
      failed++;
    }
  }
  console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
