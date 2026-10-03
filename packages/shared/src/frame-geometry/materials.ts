import type { FrameFinish } from '../catalog/enums';
import type { PartRole } from './frame';

/**
 * Physically based material settings for each part role, shared by the
 * product viewer, the try-on and the image renderer so a frame looks the
 * same everywhere. Values follow three.js MeshPhysicalMaterial semantics.
 */
export interface MaterialPreset {
  color: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  opacity: number;
  transmission: number;
  /** Procedural pattern the renderer paints on top of `color`. */
  pattern: 'none' | 'tortoise' | 'gradient';
  secondaryColor: string | null;
}

const base: MaterialPreset = {
  color: '#1D1D1F',
  roughness: 0.3,
  metalness: 0,
  clearcoat: 0.8,
  clearcoatRoughness: 0.1,
  opacity: 1,
  transmission: 0,
  pattern: 'none',
  secondaryColor: null,
};

const METAL_FINISHES: readonly FrameFinish[] = ['metallic'];

export interface MaterialInput {
  finish: FrameFinish;
  /** The variant's main colour. */
  colorHex: string;
  /** Second colour for tortoise spots or the far end of a gradient. */
  secondaryHex?: string | null;
  /** Hardware colour for metal parts on acetate frames (hinges, wire rims). */
  hardwareHex?: string;
  /** Lens tint for sunglasses, or null for clear lenses. */
  lensTintHex?: string | null;
  /** 0–1, how dark the tint is. */
  lensTintStrength?: number;
}

export function materialFor(role: PartRole, input: MaterialInput): MaterialPreset {
  const hardware = input.hardwareHex ?? '#B9B9BE';
  switch (role) {
    case 'lens': {
      const tinted = input.lensTintHex != null;
      return {
        ...base,
        color: input.lensTintHex ?? '#FFFFFF',
        roughness: 0.02,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        opacity: tinted ? 0.35 + 0.55 * (input.lensTintStrength ?? 0.7) : 0.12,
        transmission: tinted ? 0.2 : 0.9,
      };
    }
    case 'lens-edge':
      return {
        ...base,
        color: input.lensTintHex ?? '#DDE3E6',
        roughness: 0.15,
        clearcoat: 0.5,
        opacity: input.lensTintHex != null ? 0.9 : 0.55,
        transmission: 0.3,
      };
    case 'pad':
      return {
        ...base,
        color: '#F2F2F2',
        roughness: 0.4,
        clearcoat: 0.3,
        opacity: 0.55,
        transmission: 0.5,
      };
    case 'metal':
      return METAL_FINISHES.includes(input.finish)
        ? { ...base, color: input.colorHex, roughness: 0.22, metalness: 1, clearcoat: 0 }
        : { ...base, color: hardware, roughness: 0.25, metalness: 1, clearcoat: 0 };
    case 'front':
    case 'temple': {
      switch (input.finish) {
        case 'metallic':
          return { ...base, color: input.colorHex, roughness: 0.22, metalness: 1, clearcoat: 0 };
        case 'matte':
          return {
            ...base,
            color: input.colorHex,
            roughness: 0.75,
            clearcoat: 0,
            clearcoatRoughness: 0.6,
          };
        case 'crystal':
          return {
            ...base,
            color: input.colorHex,
            roughness: 0.08,
            opacity: 0.6,
            transmission: 0.6,
          };
        case 'tortoise':
          return {
            ...base,
            color: input.colorHex,
            pattern: 'tortoise',
            secondaryColor: input.secondaryHex ?? '#2B170C',
          };
        case 'gradient':
          return {
            ...base,
            color: input.colorHex,
            pattern: 'gradient',
            secondaryColor: input.secondaryHex ?? '#E8E3DA',
          };
        case 'glossy':
          return { ...base, color: input.colorHex };
      }
    }
  }
}
