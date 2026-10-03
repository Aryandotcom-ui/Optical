'use client';

import { frameFit } from '@optical/shared/face';
import { brand } from '@optical/config/brand';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTryOn } from '@/stores/try-on';
import { savedPd } from '@/stores/pd';
import { Consent, Problem } from './consent';
import { ActionBar, ColourChips, FrameCarousel, PurchaseBar } from './controls';
import { buildGlasses } from './engine/glasses';
import { initialTryOnState, TryOnController, type TryOnState } from './engine/controller';
import { Stage } from './stage';
import { defaultFrames, useFrames } from './use-frames';

/**
 * Virtual try-on: frames on your face, life-size, from the camera or a
 * photo. Everything runs in this tab; the camera stops when you leave.
 * Used by the /try-on page and the try-on dialog on product pages.
 */
export default function TryOnExperience({
  onNavigate,
  autoStart = false,
}: {
  /** Called before following a link out (the dialog closes itself). */
  onNavigate?: () => void;
  /** Start the camera straight away (the customer already chose to). */
  autoStart?: boolean;
}) {
  const t = useTranslations('tryOn');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controller = useRef<TryOnController | null>(null);
  const [state, setState] = useState<TryOnState>(initialTryOnState);
  const [split, setSplit] = useState(0.5);
  const [videoAspect, setVideoAspect] = useState(16 / 9);

  const slugs = useTryOn((session) => session.frames);
  const active = useTryOn((session) => session.active);
  const colours = useTryOn((session) => session.colours);
  const compare = useTryOn((session) => session.compare);
  const mirror = useTryOn((session) => session.mirror);
  const watermark = useTryOn((session) => session.watermark);
  const suggest = useTryOn((session) => session.suggest);
  const setCompare = useTryOn((session) => session.setCompare);
  const frames = useFrames(slugs);
  const pd = savedPd.useValue();

  // One or two frames chosen (or none): add a few popular ones to compare with.
  const topUp = slugs.length < 3;
  useEffect(() => {
    if (!topUp) return;
    let current = true;
    void defaultFrames().then(
      (defaults) => {
        if (current) suggest(defaults);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [topUp, suggest]);

  // One controller for the component's life; everything is released on unmount.
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const instance = new TryOnController(video, canvas, setState);
    controller.current = instance;
    const onVisibility = () => {
      instance.setPaused(document.hidden);
    };
    const onResize = () => {
      if (video.videoWidth > 0) setVideoAspect(video.videoWidth / video.videoHeight);
    };
    document.addEventListener('visibilitychange', onVisibility);
    video.addEventListener('resize', onResize);
    video.addEventListener('loadedmetadata', onResize);
    if (autoStart) void instance.startCamera();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      video.removeEventListener('resize', onResize);
      video.removeEventListener('loadedmetadata', onResize);
      instance.dispose();
      controller.current = null;
    };
  }, [autoStart]);

  const product = active ? frames.get(active) : undefined;
  const variant =
    product?.variants.find((entry) => entry.id === colours[product.slug]) ?? product?.variants[0];
  const compareProduct = compare && compare !== active ? frames.get(compare) : undefined;
  const compareVariant =
    compareProduct?.variants.find((entry) => entry.id === colours[compareProduct.slug]) ??
    compareProduct?.variants[0];
  const running = state.phase === 'live' || state.phase === 'photo';
  const comparing = Boolean(compareProduct);
  // With a mirrored view, the image's left half shows on the screen's right.
  const mirrored = state.phase === 'live' && mirror;
  const imageSplit = comparing ? (mirrored ? 1 - split : split) : null;

  useEffect(() => {
    const instance = controller.current;
    if (!instance || !running) return;
    const frame = product?.frame;
    instance.setGlasses(
      0,
      frame && variant ? `${product.slug}:${variant.id}` : null,
      frame && variant ? () => buildGlasses(frame, variant) : null,
    );
    const second = compareProduct?.frame;
    instance.setGlasses(
      1,
      second && compareVariant ? `${compareProduct.slug}:${compareVariant.id}` : null,
      second && compareVariant ? () => buildGlasses(second, compareVariant) : null,
    );
  }, [running, product, variant, compareProduct, compareVariant]);

  useEffect(() => {
    controller.current?.setSplit(imageSplit);
  }, [imageSplit]);

  useEffect(() => {
    if (controller.current) controller.current.pdMm = pd ?? undefined;
  }, [pd]);

  const start = () => void controller.current?.startCamera();
  const usePhoto = (file: File) => void controller.current?.usePhoto(file);
  const nextFrame = slugs.find((slug) => slug !== active && frames.has(slug)) ?? null;

  const aspect = state.phase === 'photo' ? (state.photo?.aspect ?? 4 / 3) : videoAspect;
  const name = product?.name ?? '';
  const stats = state.stats;
  const status =
    state.phase === 'photo'
      ? state.photo && !state.photo.face
        ? t('status.noFace')
        : null
      : state.paused
        ? t('status.paused')
        : stats && !stats.tracking
          ? t('status.looking')
          : stats?.lowLight
            ? t('status.lowLight')
            : stats
              ? t('status.tracking', { name })
              : null;
  const fit =
    product?.frame && stats?.faceWidthMm
      ? frameFit(product.frame.totalWidthMm, stats.faceWidthMm).fit
      : null;
  const leftName = mirrored ? (compareProduct?.name ?? '') : name;
  const rightName = mirrored ? name : (compareProduct?.name ?? '');

  return (
    <div
      className="space-y-6"
      data-try-on-phase={state.phase}
      // Measured frame rate of the whole loop (track, smooth, draw), for performance checks.
      data-fps={stats?.fps}
      data-delegate={stats?.delegate}
      data-quality={stats?.quality}
      data-tracking={
        (state.phase === 'photo' ? state.photo?.face : stats?.tracking) ? 'face' : 'none'
      }
    >
      <div className={running || state.phase === 'starting' ? 'space-y-3' : 'hidden'}>
        <Stage
          videoRef={videoRef}
          canvasRef={canvasRef}
          photoUrl={state.photo?.url ?? null}
          aspect={aspect}
          mirrored={mirrored}
          label={state.phase === 'photo' ? t('photoAlt', { name }) : t('liveAlt', { name })}
          split={comparing ? split : null}
          onSplit={setSplit}
          compareLabels={comparing ? { left: leftName, right: rightName } : null}
          status={state.phase === 'starting' ? t('starting') : status}
        />
        {fit ? (
          <p className="text-caption">
            <span className="font-medium">{t(`fit.${fit}`)}</span>{' '}
            <span className="text-ink-secondary">{t('fit.note')}</span>
          </p>
        ) : null}
      </div>

      {state.phase === 'intro' ? <Consent onStart={start} onPhoto={usePhoto} /> : null}
      {state.phase === 'error' && state.problem ? (
        <Problem problem={state.problem} onRetry={start} onPhoto={usePhoto} />
      ) : null}

      {running ? (
        <ActionBar
          live={state.phase === 'live'}
          comparing={comparing}
          compareName={nextFrame ? (frames.get(nextFrame)?.name ?? null) : null}
          onCompare={() => {
            setCompare(comparing ? null : nextFrame);
          }}
          onSnapshot={async () => {
            const blob = await controller.current?.snapshot({
              mirrored,
              watermark: watermark ? brand.wordmark : null,
            });
            if (!blob) return false;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${brand.shortName.toLowerCase()}-try-on-${product?.slug ?? 'frame'}.png`;
            link.click();
            setTimeout(() => {
              URL.revokeObjectURL(url);
            }, 10_000);
            return true;
          }}
          onPhoto={usePhoto}
          onCamera={start}
          onStop={() => controller.current?.stopCamera()}
        />
      ) : null}

      {slugs.length > 0 && frames.size === 0 ? (
        <Skeleton className="h-36 w-full rounded-card" />
      ) : (
        <FrameCarousel slugs={slugs} frames={frames} />
      )}
      {product ? (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <ColourChips product={product} />
          <PurchaseBar product={product} onNavigate={onNavigate} />
        </div>
      ) : null}
      <p className="text-caption text-ink-secondary">{t('privacy')}</p>
    </div>
  );
}
