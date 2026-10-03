export { brand, type BrandConfig } from './brand';
export {
  addressConfig,
  addressConfigFor,
  lookupPostalCode,
  normalisePhone,
  type AddressConfig,
  type PhoneConfig,
} from './address';
export {
  commerce,
  indiaMarket,
  isValidPostalCode,
  shippingZoneFor,
  type ShippingZone,
  type CommerceConfig,
  type TaxConfig,
  type PostalCodeConfig,
  type ShippingConfig,
  type CashOnDeliveryConfig,
  type PolicyConfig,
} from './commerce';
export {
  defaultFeatureFlags,
  resolveFeatureFlags,
  FeatureFlagParseError,
  type FeatureFlagName,
  type FeatureFlags,
} from './flags';
export {
  palette,
  motion,
  radius,
  statusTints,
  contrastRatio,
  mixOver,
  relativeLuminance,
  type ColorToken,
} from './tokens';
