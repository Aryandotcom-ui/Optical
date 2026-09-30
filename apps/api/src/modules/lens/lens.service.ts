import type { LensQuoteRequest, LensQuoteResponse } from '@optical/shared/lens';
import {
  lensAvailability,
  quoteLens,
  type LensCatalog,
  type LensFrameContext,
  type OptionRef,
} from '@optical/shared/lens';
import { hasBlockingIssues, strongestPower, validatePrescription } from '@optical/shared/rx';
import { AppError } from '../../lib/app-error';
import type { Cache } from '../../lib/cache';
import type { CatalogRepository } from '../catalog/catalog.repository';
import type { LensRepository } from './lens.repository';

export const LENS_CACHE = 'lens';
const LENS_TTL_SECONDS = 300;

export class LensService {
  constructor(
    private readonly lenses: LensRepository,
    private readonly catalog: CatalogRepository,
    private readonly cache: Cache,
  ) {}

  /** Every lens option with prices and plain-language copy. */
  options(): Promise<LensCatalog> {
    return this.cache.getOrSet(LENS_CACHE, 'catalog', LENS_TTL_SECONDS, () =>
      this.lenses.catalog(),
    );
  }

  /**
   * Prices a lens configuration for a frame and reports which options are
   * available. The API re-runs this on every cart write, so a price shown
   * in the browser is never trusted on its own.
   */
  async quote(request: LensQuoteRequest): Promise<LensQuoteResponse> {
    const product = await this.catalog.frameContext(request.productId);
    if (!product) throw AppError.notFound('We could not find that frame.');
    if (!product.lensesAvailable || !product.frame) {
      throw new AppError('VALIDATION_FAILED', 'This product is sold without lenses.', [
        { path: 'productId', message: 'Lenses are not available for this product.' },
      ]);
    }
    const frame: LensFrameContext = {
      rimType: product.frame.rimType as LensFrameContext['rimType'],
      lensHeightMm: product.frame.lensHeightMm,
      lensWidthMm: product.frame.lensWidthMm,
    };
    const catalog = await this.options();
    const result = quoteLens(catalog, request.config, frame);
    const config = result.ok ? result.config : request.config;

    const purpose = catalog.purposes.find((option) => option.code === config.purpose);
    let power: number | null = null;
    if (config.prescription?.mode === 'manual') {
      const issues = validatePrescription(config.prescription.rx, {
        requiresAdd: purpose?.requiresAdd ?? false,
      });
      if (!hasBlockingIssues(issues)) power = strongestPower(config.prescription.rx);
    }
    const selected: OptionRef[] = [
      ...(config.indexCode ? [{ type: 'index' as const, code: config.indexCode }] : []),
      ...(config.packageCode ? [{ type: 'package' as const, code: config.packageCode }] : []),
      ...config.extraCoatingCodes.map((code) => ({ type: 'coating' as const, code })),
      ...(config.tint ? [{ type: 'tint' as const, code: config.tint.code }] : []),
    ];
    const availability = lensAvailability(catalog, {
      purpose: config.purpose,
      frame,
      strongestPower: power,
      selected,
    });

    if (!result.ok) return { valid: false, errors: result.errors, availability };
    return {
      valid: true,
      config: result.config,
      lines: result.lines,
      totalMinor: result.totalMinor,
      warnings: result.warnings,
      recommendation: result.recommendation,
      thickness: result.thickness,
      availability,
    };
  }
}
