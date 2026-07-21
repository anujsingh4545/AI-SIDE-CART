/** Normalized money — always major units (e.g. 1899.00) + ISO currency. */
export type Money = {
  amount: number;
  currency: string;
};

/** A selectable variant (e.g. a size). */
export type ProductVariant = {
  id: string;
  label: string;
  available: boolean;
};

/** A product surfaced to the model / drawer. Flat and render-ready. */
export type Product = {
  id: string;
  title: string;
  description: string;
  url: string | null;
  image: string | null;
  price: Money | null;
  /** Set only when on sale (compareAt > price). */
  compareAtPrice: Money | null;
  available: boolean;
  /** Default/first available variant id — what add-to-cart uses by default. */
  variantId: string | null;
  /** All variants. length > 1 means the drawer shows a picker. */
  variants: ProductVariant[];
  /** Whether this product has meaningful variant choices (not just "Default Title"). */
  hasOptions: boolean;
};

/** A line item in the cart. */
export type CartLine = {
  lineId: string;
  variantId: string;
  productId: string | null;
  title: string;
  image: string | null;
  quantity: number;
  unitPrice: Money | null;
  linePrice: Money | null;
};

/** Applied discount detail for display. */
export type AppliedDiscount = {
  code: string;
  amount: Money | null;
};

/** Full cart state shared between chat + cart views. */
export type Cart = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  subtotal: Money | null;
  total: Money | null;
  lines: CartLine[];
  /** Codes on the cart and whether Shopify accepted them. */
  discountCodes: Array<{ code: string; applicable: boolean }>;
  appliedDiscounts: AppliedDiscount[];
};
