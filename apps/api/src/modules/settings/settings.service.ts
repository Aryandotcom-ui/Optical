import type { CommerceConfig } from '@optical/config/commerce';
import type { FeatureFlags } from '@optical/config/flags';
import {
  applyMarketSettings,
  marketSettingsFrom,
  marketSettingsSchema,
  type MarketSettings,
  type PublicSettings,
} from '@optical/shared/admin';
import type { Db } from '../../infra/prisma';

const MARKET_KEY = 'market';
/** Flags the admin can switch at runtime; the rest come from FEATURE_FLAGS. */
export const RUNTIME_FLAGS = ['virtualTryOn', 'frameFinder'] as const;
export type RuntimeFlag = (typeof RUNTIME_FLAGS)[number];

interface Snapshot {
  market: CommerceConfig;
  settings: MarketSettings;
  flags: FeatureFlags;
  loadedAt: number;
}

/**
 * Settings saved in the admin, over the defaults in code. Read on every
 * quote and order, so they are cached in memory for a few seconds; a save
 * on this instance clears the cache at once, others pick it up within
 * the TTL.
 */
export class SettingsService {
  private snapshot: Snapshot | null = null;

  constructor(
    private readonly db: Db,
    private readonly base: CommerceConfig,
    private readonly envFlags: FeatureFlags,
    private readonly ttlMs = 10_000,
    private readonly clock: () => number = Date.now,
  ) {}

  private async load(): Promise<Snapshot> {
    if (this.snapshot && this.clock() - this.snapshot.loadedAt < this.ttlMs) return this.snapshot;
    const [row, flagRows] = await Promise.all([
      this.db.setting.findUnique({ where: { key: MARKET_KEY } }),
      this.db.featureFlag.findMany({ where: { key: { in: [...RUNTIME_FLAGS] } } }),
    ]);
    const saved = marketSettingsSchema.partial().safeParse(row?.value ?? {});
    const overrides = saved.success ? saved.data : {};
    const settings = { ...marketSettingsFrom(this.base), ...overrides };
    const flags = { ...this.envFlags };
    for (const flag of flagRows) flags[flag.key as RuntimeFlag] = flag.enabled;
    this.snapshot = {
      market: applyMarketSettings(this.base, settings),
      settings,
      flags,
      loadedAt: this.clock(),
    };
    return this.snapshot;
  }

  async market(): Promise<CommerceConfig> {
    return (await this.load()).market;
  }

  async marketSettings(): Promise<MarketSettings> {
    return (await this.load()).settings;
  }

  async flags(): Promise<FeatureFlags> {
    return (await this.load()).flags;
  }

  async publicSettings(): Promise<PublicSettings> {
    const { settings, flags } = await this.load();
    const { lowStockThreshold: _ignored, ...market } = settings;
    return { market, flags: { virtualTryOn: flags.virtualTryOn, frameFinder: flags.frameFinder } };
  }

  invalidate(): void {
    this.snapshot = null;
  }
}

export { MARKET_KEY };
