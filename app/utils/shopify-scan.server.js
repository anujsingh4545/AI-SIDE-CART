function nDaysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function currencySymbol(code) {
  const map = { INR: "₹", USD: "$", GBP: "£", EUR: "€", AUD: "A$", CAD: "C$" };
  return map[code] ?? code;
}

async function safe(fn, fallback) {
  try {
    return await fn();
  } catch (e) {
    console.error("[shopify-scan]", e?.message ?? e);
    return fallback;
  }
}

// ── Queries ────────────────────────────────────────────────────

async function getProductCount(admin) {
  const res = await admin.graphql(`#graphql
    query { productsCount { count } }
  `);
  const { data } = await res.json();
  return data?.productsCount?.count ?? 0;
}

// Returns order count, order amounts (for AOV), currency, and sold product IDs (for slow-moving)
async function getOrderStats(admin, since) {
  const q = `created_at:>${since}`;
  const allNodes = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await admin.graphql(
      `#graphql
      query GetOrderStats($query: String!, $after: String) {
        orders(first: 250, query: $query, sortKey: CREATED_AT, reverse: true, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            totalPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 50) {
              nodes { product { id } }
            }
          }
        }
      }`,
      { variables: { query: q, after: cursor } },
    );
    const { data } = await res.json();
    const page = data?.orders;
    allNodes.push(...(page?.nodes ?? []));
    hasNextPage = page?.pageInfo?.hasNextPage ?? false;
    cursor = page?.pageInfo?.endCursor ?? null;
  }

  // ordersCount in a separate cheap query
  const countRes = await admin.graphql(
    `#graphql query C($q: String!) { ordersCount(query: $q) { count } }`,
    { variables: { q } },
  );
  const { data: cd } = await countRes.json();
  const count = cd?.ordersCount?.count ?? allNodes.length;

  const amounts = allNodes
    .map((o) => parseFloat(o.totalPriceSet?.shopMoney?.amount ?? 0))
    .filter((a) => a > 0);

  const currencyCode = allNodes[0]?.totalPriceSet?.shopMoney?.currencyCode ?? "INR";

  const soldProductIds = new Set(
    allNodes
      .flatMap((o) => o.lineItems.nodes)
      .map((li) => li.product?.id)
      .filter(Boolean),
  );

  return { count, amounts, currencyCode, soldProductIds };
}

async function getActiveDiscountsCount(admin) {
  const [codeRes, autoRes] = await Promise.all([
    admin.graphql(`#graphql
      query { codeDiscountNodes(first: 250, query: "status:ACTIVE") { nodes { id } } }
    `),
    admin.graphql(`#graphql
      query { automaticDiscountNodes(first: 250, query: "status:ACTIVE") { nodes { id } } }
    `),
  ]);
  const { data: cd } = await codeRes.json();
  const { data: ad } = await autoRes.json();
  return (
    (cd?.codeDiscountNodes?.nodes?.length ?? 0) +
    (ad?.automaticDiscountNodes?.nodes?.length ?? 0)
  );
}

// Shopify retains abandoned checkouts for ~30 days only
async function getAbandonedCount(admin, since) {
  const res = await admin.graphql(
    `#graphql
    query GetAbandoned($query: String!) {
      abandonedCheckouts(first: 250, query: $query) {
        nodes { id }
      }
    }`,
    { variables: { query: `created_at:>${since}` } },
  );
  const { data } = await res.json();
  return data?.abandonedCheckouts?.nodes?.length ?? 0;
}

// Products with inventory > 0 that had zero sales in the period
async function getSlowMovingCount(admin, soldProductIds) {
  const res = await admin.graphql(`#graphql
    query {
      products(first: 250) {
        nodes { id totalInventory }
      }
    }
  `);
  const { data } = await res.json();
  const all = data?.products?.nodes ?? [];
  return all.filter((p) => !soldProductIds.has(p.id) && (p.totalInventory ?? 0) > 0).length;
}

// ── Orchestrator ───────────────────────────────────────────────

export async function fetchScanData(admin, days = 30) {
  const since = nDaysAgoISO(days);

  // First batch — runs in parallel
  const [productCount, orderStats, discountCount, abandonedCount] =
    await Promise.all([
      safe(() => getProductCount(admin), 0),
      safe(() => getOrderStats(admin, since), {
        count: 0,
        amounts: [],
        currencyCode: "INR",
        soldProductIds: new Set(),
      }),
      safe(() => getActiveDiscountsCount(admin), 0),
      safe(() => getAbandonedCount(admin, since), 0),
    ]);

  const { count: orderCount, amounts, currencyCode, soldProductIds } = orderStats;

  // Second batch — needs soldProductIds from orderStats
  const slowMovingCount = await safe(() => getSlowMovingCount(admin, soldProductIds), 0);

  const aov =
    amounts.length > 0
      ? Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length)
      : null;

  const total = orderCount + abandonedCount;
  const abandonmentRate =
    total > 0 ? Math.round((abandonedCount / total) * 100) : null;

  return {
    productCount,
    orderCount,
    aov,
    discountCount,
    abandonmentRate,
    slowMovingCount,
    currencyCode,
    currencySymbol: currencySymbol(currencyCode),
  };
}
