import * as SQLite from "expo-sqlite";

export type CachedCategory = {
  id: string;
  name: string;
  displayOrder: number;
  image?: string | null;
  excludedBranches?: string[];
  taxPercentage?: number | null;
};

export type CachedMeal = {
  id: string;
  categoryId: string;
  name: string;
  sku?: string | null;
  listOrder?: number;
  price: number;
  description: string | null;
  image?: string | null;
  excludedBranches?: string[];
  taxPercentage?: number | null;
  effectiveBasePrice?: number;
  effectiveTaxPercentage?: number | null;
  mealSizes?: Array<{
    id?: string;
    name: string;
    sizeType: "S" | "M" | "L" | "XL";
    price: number;
    taxPercentage?: number | null;
  }>;
  mealAddOns?: Array<{
    addOn: {
      id: string;
      name: string;
      description?: string | null;
      price?: string;
      effectiveBasePrice?: number;
      effectiveTaxPercentage?: number | null;
      type: "BOOLEAN" | "QUANTITY";
      isActive?: boolean;
      excludedBranches?: string[];
      addonSizes?: Array<{
        id: string;
        sizeType: "S" | "M" | "L" | "XL";
        price: string;
        taxPercentage: number | null;
      }>;
    };
  }>;
  mealOptionalIngredients?: Array<{
    optionalIngredient: {
      id: string;
      name: string;
      description?: string | null;
    };
  }>;
  mealDeclarations?: Array<{
    declaration: {
      id: string;
      name: string;
      type: string;
      description?: string | null;
      icon?: string | null;
    };
  }>;
  branchAvailabilities?: Array<{
    branchId: string;
    isAvailableAllWeek?: boolean;
    windows?: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }>;
  }>;
};

export type CachedBranch = {
  id: string;
  organizationId: string;
  name: string;
  deliveryFee?: number | null;
  deliveryTaxPercentage?: number | null;
  taxPercentage?: number | null;
  taxInclusive?: boolean | null;
  currency?: string | null;
  timezone?: string | null;
  pickupTakeawayServiceFee?: number | null;
  serviceTaxPercentage?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type LocalOrder = {
  id: string; // client_local_uuid
  branchId: string;
  amount: number;
  paymentMethod: "CASH" | "CARD";
  paymentStatus: "PENDING" | "PAID";
  cartData: string; // JSON serialized cart items
  isSynced: number; // 0 = false, 1 = true
  offlineSequenceNumber: number;
  createdAt: string; // ISO timestamp
};

export type CachedDashboardStats = {
  totalUsers: number;
  totalMenuItems: number;
  totalOrders: number;
  totalRevenue: number;
  ordersChange: number;
  revenueChange: number;
  period: string;
  totalBranchClicks?: number;
  branchClicksChange?: number;
  branchId?: string;
  organizationId?: string;
  cachedAt: string; // ISO timestamp
};

export type CachedChartData = {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string | string[];
    tension?: number;
    yAxisID?: string;
    borderWidth?: number;
  }>;
  chartType: string;
  period: string;
  branchId?: string;
  organizationId?: string;
  branchIds?: string[];
  cachedAt: string; // ISO timestamp
};

class LocalDbService {
  private static instance: LocalDbService;
  private db: any = null;
  private dbLock: Promise<void> = Promise.resolve();

  private constructor() {
    this.initDatabase();
  }

  public static getInstance(): LocalDbService {
    if (!LocalDbService.instance) {
      LocalDbService.instance = new LocalDbService();
    }
    return LocalDbService.instance;
  }

  private async acquireLock(): Promise<() => void> {
    const release = () => {};
    this.dbLock = this.dbLock.then(release);
    await this.dbLock;
    return () => {
      this.dbLock = Promise.resolve();
    };
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.acquireLock();
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async initDatabase() {
    try {
      this.db = await SQLite.openDatabaseAsync("bellami_pos_offline.db");
      
      // Check if categories needs migration to branch-specific
      let migrateCats = false;
      try {
        const catInfo = await this.db.getAllAsync("PRAGMA table_info(categories);");
        const hasBranchId = catInfo.some((col: any) => col.name === "branch_id");
        if (!hasBranchId) {
          migrateCats = true;
        }
      } catch {
        migrateCats = true;
      }

      if (migrateCats) {
        await this.db.execAsync("DROP TABLE IF EXISTS categories;");
      }

      // Check if meals needs migration to branch-specific
      let migrateMeals = false;
      try {
        const mealInfo = await this.db.getAllAsync("PRAGMA table_info(meals);");
        const hasBranchId = mealInfo.some((col: any) => col.name === "branch_id");
        if (!hasBranchId) {
          migrateMeals = true;
        }
      } catch {
        migrateMeals = true;
      }

      if (migrateMeals) {
        await this.db.execAsync("DROP TABLE IF EXISTS meals;");
      }

      // Check if meals needs migration to add meal_branch_availabilities
      let migrateMealAvailabilities = false;
      try {
        const mealInfo = await this.db.getAllAsync("PRAGMA table_info(meals);");
        const hasBranchAvailabilities = mealInfo.some((col: any) => col.name === "meal_branch_availabilities");
        if (!hasBranchAvailabilities) {
          migrateMealAvailabilities = true;
        }
      } catch {
        migrateMealAvailabilities = true;
      }

      if (migrateMealAvailabilities) {
        await this.db.execAsync("DROP TABLE IF EXISTS meals;");
      }

      // Check if meals needs migration to add sku and list_order
      let migrateMealSkuListOrder = false;
      try {
        const mealInfo = await this.db.getAllAsync("PRAGMA table_info(meals);");
        const hasSku = mealInfo.some((col: any) => col.name === "sku");
        const hasListOrder = mealInfo.some((col: any) => col.name === "list_order");
        if (!hasSku || !hasListOrder) {
          migrateMealSkuListOrder = true;
        }
      } catch {
        migrateMealSkuListOrder = true;
      }

      if (migrateMealSkuListOrder) {
        await this.db.execAsync("DROP TABLE IF EXISTS meals;");
      }

      // Check if branches needs migration to add address columns
      try {
        const branchInfo = await this.db.getAllAsync("PRAGMA table_info(branches);");
        const hasAddress = branchInfo.some((col: any) => col.name === "address");
        if (!hasAddress) {
          console.log("[LocalDbService] Migrating branches table to add address columns");
          await this.db.execAsync("ALTER TABLE branches ADD COLUMN address TEXT;");
          await this.db.execAsync("ALTER TABLE branches ADD COLUMN city TEXT;");
          await this.db.execAsync("ALTER TABLE branches ADD COLUMN state TEXT;");
          await this.db.execAsync("ALTER TABLE branches ADD COLUMN country TEXT;");
          await this.db.execAsync("ALTER TABLE branches ADD COLUMN latitude REAL;");
          await this.db.execAsync("ALTER TABLE branches ADD COLUMN longitude REAL;");
        }
      } catch (err) {
        console.warn("[LocalDbService] Failed to migrate branches table (will be recreated):", err);
        // If migration fails, drop and recreate the table
        await this.db.execAsync("DROP TABLE IF EXISTS branches;");
      }

      // Create tables for offline operation
      await this.db.execAsync(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS categories (
          id TEXT,
          branch_id TEXT NOT NULL,
          name TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          image TEXT,
          excluded_branches TEXT,
          tax_percentage REAL,
          PRIMARY KEY (id, branch_id)
        );

        CREATE TABLE IF NOT EXISTS meals (
          id TEXT,
          branch_id TEXT NOT NULL,
          category_id TEXT NOT NULL,
          name TEXT NOT NULL,
          sku TEXT,
          list_order INTEGER DEFAULT 0,
          price REAL NOT NULL,
          description TEXT,
          image TEXT,
          excluded_branches TEXT,
          tax_percentage REAL,
          effective_base_price REAL,
          effective_tax_percentage REAL,
          meal_sizes TEXT,
          meal_addons TEXT,
          meal_optional_ingredients TEXT,
          meal_declarations TEXT,
          meal_branch_availabilities TEXT,
          PRIMARY KEY (id, branch_id)
        );

        CREATE TABLE IF NOT EXISTS offline_orders (
          id TEXT PRIMARY KEY,
          branch_id TEXT NOT NULL,
          amount REAL NOT NULL,
          payment_method TEXT NOT NULL,
          payment_status TEXT NOT NULL,
          cart_data TEXT NOT NULL,
          is_synced INTEGER DEFAULT 0,
          offline_sequence_number INTEGER,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS branches (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          name TEXT NOT NULL,
          delivery_fee REAL,
          delivery_tax_percentage REAL,
          tax_percentage REAL,
          tax_inclusive INTEGER,
          currency TEXT,
          timezone TEXT,
          pickup_takeaway_service_fee REAL,
          service_tax_percentage REAL,
          address TEXT,
          city TEXT,
          state TEXT,
          country TEXT,
          latitude REAL,
          longitude REAL
        );

        CREATE TABLE IF NOT EXISTS settings (
          branch_id TEXT PRIMARY KEY,
          data TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dashboard_stats (
          id TEXT PRIMARY KEY,
          period TEXT NOT NULL,
          branch_id TEXT,
          organization_id TEXT,
          total_users INTEGER DEFAULT 0,
          total_menu_items INTEGER DEFAULT 0,
          total_orders INTEGER DEFAULT 0,
          total_revenue REAL DEFAULT 0,
          orders_change REAL DEFAULT 0,
          revenue_change REAL DEFAULT 0,
          total_branch_clicks INTEGER DEFAULT 0,
          branch_clicks_change REAL DEFAULT 0,
          cached_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chart_data (
          id TEXT PRIMARY KEY,
          chart_type TEXT NOT NULL,
          period TEXT NOT NULL,
          branch_id TEXT,
          organization_id TEXT,
          labels TEXT NOT NULL,
          datasets TEXT NOT NULL,
          cached_at TEXT NOT NULL
        );
      `);
      
      // Add columns to branches table if they don't exist (for existing databases)
      try {
        await this.db.execAsync(`
          ALTER TABLE branches ADD COLUMN delivery_fee REAL;
        `);
      } catch (alterError) {
        // Column likely already exists, ignore error
      }
      try {
        await this.db.execAsync(`
          ALTER TABLE branches ADD COLUMN delivery_tax_percentage REAL;
        `);
      } catch (alterError) {
        // Column likely already exists, ignore error
      }
      try {
        await this.db.execAsync(`
          ALTER TABLE branches ADD COLUMN tax_percentage REAL;
        `);
      } catch (alterError) {
        // Column likely already exists, ignore error
      }
      try {
        await this.db.execAsync(`
          ALTER TABLE branches ADD COLUMN tax_inclusive INTEGER;
        `);
      } catch (alterError) {
        // Column likely already exists, ignore error
      }
      try {
        await this.db.execAsync(`
          ALTER TABLE branches ADD COLUMN currency TEXT;
        `);
      } catch (alterError) {
        // Column likely already exists, ignore error
      }
      try {
        await this.db.execAsync(`
          ALTER TABLE branches ADD COLUMN timezone TEXT;
        `);
      } catch (alterError) {
        // Column likely already exists, ignore error
      }
      try {
        await this.db.execAsync(`
          ALTER TABLE branches ADD COLUMN pickup_takeaway_service_fee REAL;
        `);
      } catch (alterError) {
        // Column likely already exists, ignore error
      }
      try {
        await this.db.execAsync(`
          ALTER TABLE branches ADD COLUMN service_tax_percentage REAL;
        `);
      } catch (alterError) {
        // Column likely already exists, ignore error
      }
    
    } catch (error) {
      console.error("[LocalDbService] Database initialization failed:", error);
    }
  }

  private getSqlString(val: any): string | null {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    return str === "null" || str === "undefined" || str === "" ? null : str;
  }

  private getSqlNum(val: any): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === "object") {
      const parsed = parseFloat(String(val));
      return isNaN(parsed) || !isFinite(parsed) ? null : parsed;
    }
    const parsed = parseFloat(String(val));
    return isNaN(parsed) || !isFinite(parsed) ? null : parsed;
  }

  private getSqlBoolean(val: any): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === "object") {
      const str = String(val).toLowerCase();
      return str === "true" || str === "1" ? 1 : 0;
    }
    const strVal = String(val).toLowerCase();
    return val === true || val === 1 || strVal === "true" ? 1 : 0;
  }

  private sanitizeParams(params: any[]): any[] {
    return params.map((val, index) => {
      // Check for null/undefined first (typeof null === "object" in JS)
      if (val === null || val === undefined) {
        return null;
      }
      if (typeof val === "object") {
        try {
          const jsonStr = JSON.stringify(val);
          return jsonStr;
        } catch {
          console.warn(`[LocalDbService] Failed to stringify param ${index}`, val);
          return null;
        }
      }
      return val;
    });
  }

  // --- Settings Caching ---
  public async cacheSettings(branchId: string, settings: any) {
    return this.withLock(async () => {
      if (!this.db) await this.initDatabase();
      await this.db.runAsync(
        "INSERT OR REPLACE INTO settings (branch_id, data) VALUES (?, ?);",
        [this.getSqlString(branchId) || "global", JSON.stringify(settings)]
      );
    });
  }

  public async getCachedSettings(branchId: string): Promise<any | null> {
    if (!this.db) await this.initDatabase();
    const row = await this.db.getFirstAsync("SELECT data FROM settings WHERE branch_id = ?;", [this.getSqlString(branchId) || "global"]);
    if (!row) return null;
    try {
      return JSON.parse(row.data);
    } catch {
      return null;
    }
  }

  // --- Category Caching ---
  public async cacheCategories(branchId: string, categories: CachedCategory[]) {
    return this.withLock(async () => {
      if (!this.db) await this.initDatabase();
      const safeBranchId = this.getSqlString(branchId) || "global";
      await this.db.runAsync("DELETE FROM categories WHERE branch_id = ?;", [safeBranchId]);
      for (const cat of categories) {
        const excludedBranchesJson = cat.excludedBranches && cat.excludedBranches.length > 0 ? JSON.stringify(cat.excludedBranches) : "";
        const taxPercentage = cat.taxPercentage !== null && cat.taxPercentage !== undefined ? this.getSqlNum(cat.taxPercentage) : 0;

        const params = [
          this.getSqlString(cat.id),
          safeBranchId,
          this.getSqlString(cat.name) || "",
          this.getSqlNum(cat.displayOrder) || 0,
          this.getSqlString(cat.image) || "",
          excludedBranchesJson,
          taxPercentage,
        ];

        await this.db.runAsync(
          "INSERT OR REPLACE INTO categories (id, branch_id, name, display_order, image, excluded_branches, tax_percentage) VALUES (?, ?, ?, ?, ?, ?, ?);",
          params
        );
      }
    });
  }

  public async getCategories(branchId: string): Promise<CachedCategory[]> {
    if (!this.db) await this.initDatabase();
    const safeBranchId = this.getSqlString(branchId) || "global";
    const rows = await this.db.getAllAsync("SELECT * FROM categories WHERE branch_id = ? ORDER BY display_order ASC;", [safeBranchId]);
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      displayOrder: r.display_order,
      image: r.image,
      excludedBranches: r.excluded_branches && r.excluded_branches !== "" ? JSON.parse(r.excluded_branches) : undefined,
      taxPercentage: r.tax_percentage,
    }));
  }

  // --- Meal Caching ---
  public async cacheMeals(branchId: string, meals: CachedMeal[]) {
    return this.withLock(async () => {
      if (!this.db) await this.initDatabase();
      const safeBranchId = this.getSqlString(branchId) || "global";
      await this.db.runAsync("DELETE FROM meals WHERE branch_id = ?;", [safeBranchId]);
      for (const m of meals) {
        let excludedBranchesJson = "";
        try {
          excludedBranchesJson = m.excludedBranches && m.excludedBranches.length > 0 ? JSON.stringify(m.excludedBranches) : "";
        } catch (e) {
          excludedBranchesJson = "";
        }

        let mealSizesJson = "";
        try {
          mealSizesJson = m.mealSizes && m.mealSizes.length > 0 ? JSON.stringify(m.mealSizes) : "";
        } catch (e) {
          mealSizesJson = "";
        }

        let mealAddOnsJson = "";
        try {
          mealAddOnsJson = m.mealAddOns && m.mealAddOns.length > 0 ? JSON.stringify(m.mealAddOns) : "";
        } catch (e) {
          mealAddOnsJson = "";
        }

        let mealOptionalIngredientsJson = "";
        try {
          mealOptionalIngredientsJson = m.mealOptionalIngredients && m.mealOptionalIngredients.length > 0 ? JSON.stringify(m.mealOptionalIngredients) : "";
        } catch (e) {
          mealOptionalIngredientsJson = "";
        }

        let mealDeclarationsJson = "";
        try {
          mealDeclarationsJson = m.mealDeclarations && m.mealDeclarations.length > 0 ? JSON.stringify(m.mealDeclarations) : "";
        } catch (e) {
          mealDeclarationsJson = "";
        }

        let branchAvailabilitiesJson = "";
        try {
          branchAvailabilitiesJson = m.branchAvailabilities && m.branchAvailabilities.length > 0 ? JSON.stringify(m.branchAvailabilities) : "";
        } catch (e) {
          branchAvailabilitiesJson = "";
        }

        const params = [
          this.getSqlString(m.id),
          safeBranchId,
          this.getSqlString(m.categoryId) || "",
          this.getSqlString(m.name) || "",
          this.getSqlString(m.sku) || "",
          this.getSqlNum(m.listOrder) || 0,
          this.getSqlNum(m.price) || 0,
          this.getSqlString(m.description) || "",
          this.getSqlString(m.image) || "",
          excludedBranchesJson,
          this.getSqlNum(m.taxPercentage) || 0,
          this.getSqlNum(m.effectiveBasePrice) || 0,
          this.getSqlNum(m.effectiveTaxPercentage) || 0,
          mealSizesJson,
          mealAddOnsJson,
          mealOptionalIngredientsJson,
          mealDeclarationsJson,
          branchAvailabilitiesJson,
        ];

        await this.db.runAsync(
          "INSERT OR REPLACE INTO meals (id, branch_id, category_id, name, sku, list_order, price, description, image, excluded_branches, tax_percentage, effective_base_price, effective_tax_percentage, meal_sizes, meal_addons, meal_optional_ingredients, meal_declarations, meal_branch_availabilities) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
          params
        );
      }
    });
  }

  public async getMeals(branchId: string, categoryId?: string): Promise<CachedMeal[]> {
    if (!this.db) await this.initDatabase();
    let query = "SELECT * FROM meals WHERE branch_id = ?";
    const params: any[] = [this.getSqlString(branchId) || "global"];
    if (categoryId) {
      query += " AND category_id = ?";
      params.push(this.getSqlString(categoryId));
    }
    query += " ORDER BY list_order ASC;";
    const rows = await this.db.getAllAsync(query, params);
    return rows.map((r: any) => ({
      id: r.id,
      categoryId: r.category_id,
      name: r.name,
      sku: r.sku,
      listOrder: r.list_order,
      price: r.price,
      description: r.description,
      image: r.image,
      excludedBranches: r.excluded_branches && r.excluded_branches !== "" ? JSON.parse(r.excluded_branches) : undefined,
      taxPercentage: r.tax_percentage,
      effectiveBasePrice: r.effective_base_price,
      effectiveTaxPercentage: r.effective_tax_percentage,
      mealSizes: r.meal_sizes && r.meal_sizes !== "" ? JSON.parse(r.meal_sizes) : undefined,
      mealAddOns: r.meal_addons && r.meal_addons !== "" ? JSON.parse(r.meal_addons) : undefined,
      mealOptionalIngredients: r.meal_optional_ingredients && r.meal_optional_ingredients !== "" ? JSON.parse(r.meal_optional_ingredients) : undefined,
      mealDeclarations: r.meal_declarations && r.meal_declarations !== "" ? JSON.parse(r.meal_declarations) : undefined,
      branchAvailabilities: r.meal_branch_availabilities && r.meal_branch_availabilities !== "" ? JSON.parse(r.meal_branch_availabilities) : undefined,
    }));
  }

  // --- Offline Order Management ---
  public async saveOfflineOrder(order: Omit<LocalOrder, "offlineSequenceNumber" | "isSynced">): Promise<number> {
    return this.withLock(async () => {
      if (!this.db) await this.initDatabase();

      // Check if order already exists to prevent duplicates
      const existing = await this.db.getFirstAsync("SELECT id FROM offline_orders WHERE id = ?;", [order.id]);
      if (existing) {
        console.warn("[LocalDbService] Order with this ID already exists, skipping save:", order.id);
        // Return existing sequence number
        const seqResult = await this.db.getFirstAsync("SELECT offline_sequence_number FROM offline_orders WHERE id = ?;", [order.id]);
        return seqResult?.offline_sequence_number || 0;
      }

      // Determine local sequential transaction number
      const result = await this.db.getFirstAsync("SELECT MAX(offline_sequence_number) as max_seq FROM offline_orders;");
      const nextSeq = (result?.max_seq || 0) + 1;

      await this.db.runAsync(
        `INSERT INTO offline_orders
         (id, branch_id, amount, payment_method, payment_status, cart_data, is_synced, offline_sequence_number, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);`,
        [order.id, order.branchId, order.amount, order.paymentMethod, order.paymentStatus, order.cartData, nextSeq, order.createdAt]
      );

      return nextSeq;
    });
  }

  public async getUnsyncedOrders(): Promise<LocalOrder[]> {
    if (!this.db) await this.initDatabase();
    const rows = await this.db.getAllAsync("SELECT * FROM offline_orders WHERE is_synced = 0 ORDER BY created_at ASC;");
    return rows.map((r: any) => ({
      id: r.id,
      branchId: r.branch_id,
      amount: r.amount,
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status,
      cartData: r.cart_data,
      isSynced: r.is_synced,
      offlineSequenceNumber: r.offline_sequence_number,
      createdAt: r.created_at,
    }));
  }

  public async getAllLocalOrders(): Promise<LocalOrder[]> {
    if (!this.db) await this.initDatabase();
    const rows = await this.db.getAllAsync("SELECT * FROM offline_orders ORDER BY created_at DESC;");
    return rows.map((r: any) => ({
      id: r.id,
      branchId: r.branch_id,
      amount: r.amount,
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status,
      cartData: r.cart_data,
      isSynced: r.is_synced,
      offlineSequenceNumber: r.offline_sequence_number,
      createdAt: r.created_at,
    }));
  }

  public async markOrderSynced(id: string) {
    return this.withLock(async () => {
      if (!this.db) await this.initDatabase();
      await this.db.runAsync("UPDATE offline_orders SET is_synced = 1 WHERE id = ?;", [id]);
    });
  }

  // --- Organization Caching ---
  public async cacheOrganizations(orgs: { id: string; name: string }[]) {
    return this.withLock(async () => {
      if (!this.db) await this.initDatabase();
      await this.db.runAsync("DELETE FROM organizations;");
      for (const org of orgs) {
        await this.db.runAsync(
          "INSERT OR REPLACE INTO organizations (id, name) VALUES (?, ?);",
          [org.id, org.name]
        );
      }
    });
  }

  public async getCachedOrganizations(): Promise<{ id: string; name: string }[]> {
    if (!this.db) await this.initDatabase();
    const rows = await this.db.getAllAsync("SELECT * FROM organizations;");
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
    }));
  }

  // --- Branch Caching ---
  public async cacheBranches(branches: CachedBranch[]) {
    return this.withLock(async () => {
      if (!this.db) await this.initDatabase();
      // Only delete branches of organizations that are represented in the list to prevent wiping out other organizations' branches
      const orgIds = Array.from(new Set(branches.map(b => b.organizationId).filter(Boolean)));
      for (const orgId of orgIds) {
        await this.db.runAsync("DELETE FROM branches WHERE organization_id = ?;", [this.getSqlString(orgId)]);
      }

      for (const br of branches) {
        const currencyVal = this.getSqlString(br.currency);
        const timezoneVal = this.getSqlString(br.timezone);
        const addressVal = this.getSqlString(br.address);
        const cityVal = this.getSqlString(br.city);
        const stateVal = this.getSqlString(br.state);
        const countryVal = this.getSqlString(br.country);
        const latitudeVal = this.getSqlNum(br.latitude);
        const longitudeVal = this.getSqlNum(br.longitude);
        const params = [
          this.getSqlString(br.id),
          this.getSqlString(br.organizationId),
          this.getSqlString(br.name) || "",
          this.getSqlNum(br.deliveryFee) || 0,
          this.getSqlNum(br.deliveryTaxPercentage) || 0,
          this.getSqlNum(br.taxPercentage) || 0,
          this.getSqlBoolean(br.taxInclusive) || 0,
          currencyVal === null ? "" : currencyVal,
          timezoneVal === null ? "" : timezoneVal,
          this.getSqlNum(br.pickupTakeawayServiceFee) || 0,
          this.getSqlNum(br.serviceTaxPercentage) || 0,
          addressVal === null ? "" : addressVal,
          cityVal === null ? "" : cityVal,
          stateVal === null ? "" : stateVal,
          countryVal === null ? "" : countryVal,
          latitudeVal || 0,
          longitudeVal || 0,
        ];

        try {
          await this.db.runAsync(
            "INSERT OR REPLACE INTO branches (id, organization_id, name, delivery_fee, delivery_tax_percentage, tax_percentage, tax_inclusive, currency, timezone, pickup_takeaway_service_fee, service_tax_percentage, address, city, state, country, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
            params
          );
        } catch (err) {
          console.error("[LocalDbService] cacheBranches SQLite runAsync error:", err);
          console.error("[LocalDbService] Faulty branch parameters list:");
          params.forEach((param, idx) => {
            console.error(`  Index ${idx}: value="${param}", typeof="${typeof param}", isArray=${Array.isArray(param)}`);
          });
          console.error("[LocalDbService] Original branch object:", JSON.stringify(br));
          throw err;
        }
      }
    });
  }

  public async getBranches(): Promise<CachedBranch[]> {
    if (!this.db) await this.initDatabase();
    const rows = await this.db.getAllAsync("SELECT * FROM branches;");
    return rows.map((r: any) => ({
      id: r.id,
      organizationId: r.organization_id,
      name: r.name,
      deliveryFee: r.delivery_fee,
      deliveryTaxPercentage: r.delivery_tax_percentage,
      taxPercentage: r.tax_percentage,
      taxInclusive: r.tax_inclusive === 1 ? true : (r.tax_inclusive === 0 ? false : null),
      currency: r.currency,
      timezone: r.timezone,
      pickupTakeawayServiceFee: r.pickup_takeaway_service_fee,
      serviceTaxPercentage: r.service_tax_percentage,
      address: r.address,
      city: r.city,
      state: r.state,
      country: r.country,
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  }

  public async getCachedBranches(organizationId?: string): Promise<CachedBranch[]> {
    if (!this.db) await this.initDatabase();
    let query = "SELECT * FROM branches";
    const params: any[] = [];
    if (organizationId) {
      query += " WHERE organization_id = ?";
      params.push(organizationId);
    }
    const rows = await this.db.getAllAsync(query, params);
    return rows.map((r: any) => ({
      id: r.id,
      organizationId: r.organization_id,
      name: r.name,
      deliveryFee: r.delivery_fee,
      deliveryTaxPercentage: r.delivery_tax_percentage,
      taxPercentage: r.tax_percentage,
      taxInclusive: r.tax_inclusive === 1 ? true : (r.tax_inclusive === 0 ? false : null),
      currency: r.currency,
      timezone: r.timezone,
      pickupTakeawayServiceFee: r.pickup_takeaway_service_fee,
      serviceTaxPercentage: r.service_tax_percentage,
      address: r.address,
      city: r.city,
      state: r.state,
      country: r.country,
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  }

  public async getBranchById(branchId: string): Promise<CachedBranch | null> {
    if (!this.db) await this.initDatabase();
    const row = await this.db.getFirstAsync("SELECT * FROM branches WHERE id = ?;", [branchId]);
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      deliveryFee: row.delivery_fee,
      deliveryTaxPercentage: row.delivery_tax_percentage,
      taxPercentage: row.tax_percentage,
      taxInclusive: row.tax_inclusive === 1 ? true : (row.tax_inclusive === 0 ? false : null),
      currency: row.currency,
      timezone: row.timezone,
      pickupTakeawayServiceFee: row.pickup_takeaway_service_fee,
      serviceTaxPercentage: row.service_tax_percentage,
      address: row.address,
      city: row.city,
      state: row.state,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
    };
  }

  // --- Dashboard Data Caching ---
  public async cacheDashboardStats(stats: CachedDashboardStats) {
    return this.withLock(async () => {
      if (!this.db) await this.initDatabase();
      const id = `${stats.period}_${stats.branchId || 'all'}_${stats.organizationId || 'none'}`;

      // Dynamically build query to completely avoid passing SQL null/undefined parameters,
      // since expo-sqlite's JSI binding has conversion bugs with nulls inside maps on Android.
      const columns = [
        "id",
        "period",
        "total_users",
        "total_menu_items",
        "total_orders",
        "total_revenue",
        "orders_change",
        "revenue_change",
        "total_branch_clicks",
        "branch_clicks_change",
        "cached_at"
      ];
      const params = [
        id,
        stats.period,
        this.getSqlNum(stats.totalUsers) || 0,
        this.getSqlNum(stats.totalMenuItems) || 0,
        this.getSqlNum(stats.totalOrders) || 0,
        this.getSqlNum(stats.totalRevenue) || 0,
        this.getSqlNum(stats.ordersChange) || 0,
        this.getSqlNum(stats.revenueChange) || 0,
        this.getSqlNum(stats.totalBranchClicks) || 0,
        this.getSqlNum(stats.branchClicksChange) || 0,
        stats.cachedAt,
      ];

      const branchIdVal = this.getSqlString(stats.branchId);
      if (branchIdVal !== null) {
        columns.push("branch_id");
        params.push(branchIdVal);
      }

      const orgIdVal = this.getSqlString(stats.organizationId);
      if (orgIdVal !== null) {
        columns.push("organization_id");
        params.push(orgIdVal);
      }


      const placeholders = columns.map(() => "?").join(", ");
      const sql = `INSERT OR REPLACE INTO dashboard_stats (${columns.join(", ")}) VALUES (${placeholders});`;

      await this.db.runAsync(sql, params);
    });
  }

  public async getCachedDashboardStats(period: string, branchId?: string, organizationId?: string): Promise<CachedDashboardStats | null> {
    if (!this.db) await this.initDatabase();
    const id = `${period}_${branchId || 'all'}_${organizationId || 'none'}`;
    const row = await this.db.getFirstAsync("SELECT * FROM dashboard_stats WHERE id = ?;", [id]);
    if (!row) return null;
    return {
      totalUsers: row.total_users,
      totalMenuItems: row.total_menu_items,
      totalOrders: row.total_orders,
      totalRevenue: row.total_revenue,
      ordersChange: row.orders_change,
      revenueChange: row.revenue_change,
      period: row.period,
      totalBranchClicks: row.total_branch_clicks,
      branchClicksChange: row.branch_clicks_change,
      branchId: row.branch_id,
      organizationId: row.organization_id,
      cachedAt: row.cached_at,
    };
  }

  public async cacheChartData(chartData: CachedChartData) {
    return this.withLock(async () => {
      if (!this.db) await this.initDatabase();
      const id = `${chartData.chartType}_${chartData.period}_${chartData.branchId || 'all'}_${chartData.organizationId || 'none'}`;
      const labelsJson = chartData.labels ? JSON.stringify(chartData.labels) : "[]";
      const datasetsJson = chartData.datasets ? JSON.stringify(chartData.datasets) : "[]";
      const branchIdsJson = chartData.branchIds ? JSON.stringify(chartData.branchIds) : null;

      // Dynamically build query to completely avoid passing SQL null/undefined parameters,
      // since expo-sqlite's JSI binding has conversion bugs with nulls inside maps on Android.
      const columns = [
        "id",
        "chart_type",
        "period",
        "labels",
        "datasets",
        "cached_at"
      ];
      const params = [
        id,
        chartData.chartType,
        chartData.period,
        labelsJson,
        datasetsJson,
        chartData.cachedAt,
      ];

      const branchIdVal = this.getSqlString(chartData.branchId);
      if (branchIdVal !== null) {
        columns.push("branch_id");
        params.push(branchIdVal);
      }

      const orgIdVal = this.getSqlString(chartData.organizationId);
      if (orgIdVal !== null) {
        columns.push("organization_id");
        params.push(orgIdVal);
      }


      const placeholders = columns.map(() => "?").join(", ");
      const sql = `INSERT OR REPLACE INTO chart_data (${columns.join(", ")}) VALUES (${placeholders});`;

      await this.db.runAsync(sql, params);
    });
  }

  public async getCachedChartData(chartType: string, period: string, branchId?: string, organizationId?: string): Promise<CachedChartData | null> {
    if (!this.db) await this.initDatabase();
    const id = `${chartType}_${period}_${branchId || 'all'}_${organizationId || 'none'}`;
    const row = await this.db.getFirstAsync("SELECT * FROM chart_data WHERE id = ?;", [id]);
    if (!row) return null;
    return {
      labels: JSON.parse(row.labels),
      datasets: JSON.parse(row.datasets),
      chartType: row.chart_type,
      period: row.period,
      branchId: row.branch_id,
      organizationId: row.organization_id,
      cachedAt: row.cached_at,
    };
  }

  // --- Debug: Dump all SQLite contents ---
  public async debugDumpAllTables() {
    if (!this.db) await this.initDatabase();

    try {
      const branches = await this.db.getAllAsync("SELECT * FROM branches;");
    } catch (e) {
      console.error("[DEBUG] Error reading branches:", e);
    }

    try {
      const categories = await this.db.getAllAsync("SELECT * FROM categories;");
    } catch (e) {
      console.error("[DEBUG] Error reading categories:", e);
    }

    try {
      const meals = await this.db.getAllAsync("SELECT * FROM meals;");
    } catch (e) {
      console.error("[DEBUG] Error reading meals:", e);
    }

    try {
      const settings = await this.db.getAllAsync("SELECT * FROM settings;");
    } catch (e) {
      console.error("[DEBUG] Error reading settings:", e);
    }
  }
}

export default LocalDbService;
