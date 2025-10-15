/**
 * DynamoDB table schemas and type definitions
 */

/**
 * Product entity from products table
 */
export interface Product {
  /** Unique identifier (UUID) - Primary Key */
  id: string;

  /** Product name */
  title: string;

  /** Product description */
  description: string;

  /** Price in cents (e.g., 99999 = $999.99) */
  price: number;
}

/**
 * Stock entity from stock table
 */
export interface Stock {
  /** Product ID (UUID) - Primary Key, Foreign Key to products.id */
  product_id: string;

  /** Total number of products in stock */
  count: number;
}

/**
 * Combined Product with Stock information
 * Used for API responses
 */
export interface ProductWithStock extends Product {
  /** Stock count from stock table */
  count: number;
}

/**
 * Input data for creating a new product
 */
export interface CreateProductInput {
  title: string;
  description: string;
  price: number;
  count: number;
}

/**
 * Input data for updating a product
 */
export interface UpdateProductInput {
  id: string;
  title?: string;
  description?: string;
  price?: number;
}

/**
 * Input data for updating stock
 */
export interface UpdateStockInput {
  product_id: string;
  count: number;
}

/**
 * DynamoDB table names
 */
export const TABLE_NAMES = {
  PRODUCTS: "products",
  STOCK: "stock",
} as const;

/**
 * Price utility functions
 */
export const PriceUtils = {
  /**
   * Convert dollars to cents
   * @param dollars - Amount in dollars (e.g., 999.99)
   * @returns Amount in cents (e.g., 99999)
   */
  toCents: (dollars: number): number => Math.round(dollars * 100),

  /**
   * Convert cents to dollars
   * @param cents - Amount in cents (e.g., 99999)
   * @returns Amount in dollars (e.g., 999.99)
   */
  toDollars: (cents: number): number => cents / 100,

  /**
   * Format cents as currency string
   * @param cents - Amount in cents
   * @param locale - Locale for formatting (default: 'en-US')
   * @param currency - Currency code (default: 'USD')
   * @returns Formatted currency string (e.g., "$999.99")
   */
  format: (
    cents: number,
    locale: string = "en-US",
    currency: string = "USD"
  ): string => {
    const dollars = PriceUtils.toDollars(cents);
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
    }).format(dollars);
  },
};

/**
 * Validation utilities
 */
export const Validators = {
  /**
   * Validate UUID format
   */
  isValidUUID: (uuid: string): boolean => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  },

  /**
   * Validate product data
   */
  isValidProduct: (product: Partial<Product>): boolean => {
    return !!(
      product.title &&
      product.title.length > 0 &&
      product.title.length <= 255 &&
      product.price !== undefined &&
      product.price >= 0
    );
  },

  /**
   * Validate stock count
   */
  isValidStockCount: (count: number): boolean => {
    return Number.isInteger(count) && count >= 0;
  },
};
