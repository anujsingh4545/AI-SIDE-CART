import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function specFromRow(row) {
  return {
    general: row.general,
    header:  row.header,
    body:    row.body,
    footer:  row.footer,
  };
}

export async function upsertShop(shopDomain, brandName) {
  await prisma.shop.upsert({
    where:  { shopName: shopDomain },
    update: { brandName },
    create: { shopName: shopDomain, brandName },
  });
}

export async function saveCartSpec(shopDomain, spec) {
  const data = {
    general: spec.general,
    header:  spec.header,
    body:    spec.body,
    footer:  spec.footer,
  };

  await prisma.cartSpec.upsert({
    where:  { shopName: shopDomain },
    update: data,
    create: { shopName: shopDomain, ...data },
  });
}

export async function getCartSpec(shopDomain) {
  const row = await prisma.cartSpec.findUnique({
    where: { shopName: shopDomain },
  });
  return row ? specFromRow(row) : null;
}
