// =============================================================================
// Centralized react-query key registry
// Used for both fetching (listTable) and invalidating (useRealtimeTable)
// =============================================================================

export const PRODUCTS_QUERY_KEYS = {
  all: ["products"] as const,
  lists: () => [...PRODUCTS_QUERY_KEYS.all, "list"] as const,
  list: (params: unknown) => [...PRODUCTS_QUERY_KEYS.lists(), params] as const,
};

export const PARTIES_QUERY_KEYS = {
  all: ["parties"] as const,
  lists: () => [...PARTIES_QUERY_KEYS.all, "list"] as const,
  list: (params: unknown) => [...PARTIES_QUERY_KEYS.lists(), params] as const,
};

export const WAREHOUSES_QUERY_KEYS = {
  all: ["warehouses"] as const,
  lists: () => [...WAREHOUSES_QUERY_KEYS.all, "list"] as const,
  list: (params: unknown) => [...WAREHOUSES_QUERY_KEYS.lists(), params] as const,
};

export const STOCK_QUERY_KEYS = {
  all: ["stock", "stock-movements"] as const,
  levels: () => [...STOCK_QUERY_KEYS.all, "levels"] as const,
  level: (params: unknown) => [...STOCK_QUERY_KEYS.levels(), params] as const,
  movements: () => [...STOCK_QUERY_KEYS.all, "movements"] as const,
  movement: (params: unknown) => [...STOCK_QUERY_KEYS.movements(), params] as const,
};

export const DASHBOARD_QUERY_KEYS = {
  all: ["dashboard"] as const,
  counters: () => [...DASHBOARD_QUERY_KEYS.all, "counters"] as const,
};
