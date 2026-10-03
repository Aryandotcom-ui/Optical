'use client';

import {
  averageRatios,
  classifyFaceShape,
  faceRatios,
  faceWidthMm,
  measureFace,
  medianReading,
  turnFromCamera,
  type FaceShapeResult,
} from '@optical/shared/face';
import type { FinderAnswers } from '@optical/shared/frame-finder';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  FaceCamera,
  FaceCameraError,
  type FaceCameraProblem,
} from '@/components/try-on/engine/face-camera';
import { Button } from '@/components/ui/button';
import { finderHref } from '@/lib/finder-params';
import { savedPd } from '@/stores/pd';
import { FaceShapeFigure } from './face-shape-figure';

/** Front-on frames averaged for one reading (about a second of video). */
const SAMPLES = 30;
/** Frames turned further than this from the camera are ignored. */
const MAX_TURN_DEGREES = 12;

type Phase =
  | { kind: 'intro' }
  | { kind: 'starting' }
  | { kind: 'measuring'; samples: number; turned: boolean }
  | { kind: 'result'; result: FaceShapeResult; widthMm: number | null }
  | { kind: 'error'; problem: FaceCameraProblem };

/**
 * Measures face proportions from the camera and suggests a face shape,
 * with its confidence and the ratios behind it. Landmarks stay in this
 * tab and are dropped as soon as the reading is done.
 */
export default function FaceShapeDetector({
  answers,
  onClose,
}: {
  answers: FinderAnswers;
  onClose: () => void;
}) {
  const t = useTranslations('frameFinder');
  const tErrors = useTranslations('tryOn.measureErrors');
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useRef<FaceCamera | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => camera.current?.stop(), []);
  useEffect(() => {
    heading.current?.focus();
  }, [phase.kind]);

  const start = async () => {
    const video = videoRef.current;
    if (!video) return;
    camera.current?.stop();
    setPhase({ kind: 'starting' });
    const ratios: ReturnType<typeof faceRatios>[] = [];
    const widths: number[] = [];
    const pd = savedPd.get() ?? undefined;
    const session = new FaceCamera(
      video,
      (frame) => {
        const { width, height } = session.size;
        if (!frame) return;
        if (turnFromCamera(frame.landmarks, width, height, frame.matrix) > MAX_TURN_DEGREES) {
          setPhase({ kind: 'measuring', samples: ratios.length, turned: true });
          return;
        }
        const measured = measureFace(frame.landmarks, width, height);
        ratios.push(faceRatios(measured));
        widths.push(faceWidthMm(measured, pd));
        if (ratios.length < SAMPLES) {
          setPhase({ kind: 'measuring', samples: ratios.length, turned: false });
          return;
        }
        session.stop();
        const average = averageRatios(ratios);
        const reading = medianReading(widths);
        if (!average) return;
        setPhase({
          kind: 'result',
          result: classifyFaceShape(average),
          widthMm:
            reading !== null && reading >= 100 && reading <= 200 ? Math.round(reading) : null,
        });
      },
      () => {
        setPhase({ kind: 'intro' });
      },
    );
    camera.current = session;
    try {
      await session.start();
      setPhase({ kind: 'measuring', samples: 0, turned: false });
    } catch (error) {
      setPhase({
        kind: 'error',
        problem: error instanceof FaceCameraError ? error.problem : 'unknown',
      });
    }
  };

  const close = () => {
    camera.current?.stop();
    onClose();
  };

  const live = phase.kind === 'starting' || phase.kind === 'measuring';
  const percent = phase.kind === 'measuring' ? Math.round((phase.samples / SAMPLES) * 100) : 0;
  const fixed = (value: number) => value.toFixed(2);

  return (
    <section
      aria-labelledby="face-detect-title"
      className="space-y-4 rounded-card bg-surface p-4 ring-1 ring-hairline sm:p-6"
    >
      <h3
        id="face-detect-title"
        ref={heading}
        tabIndex={-1}
        className="text-body-lg font-semibold focus:outline-none"
      >
        {phase.kind === 'result'
          ? t('detect.result', { shape: t(`faceShapes.${phase.result.shape}`).toLowerCase() })
          : phase.kind === 'error'
            ? tErrors(`${phase.problem}.title`)
            : t('detect.title')}
      </h3>

      <div
        className={
          live
            ? 'relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-media bg-ink'
            : 'hidden'
        }
      >
        <video
          ref={videoRef}
          aria-hidden="true"
          muted
          playsInline
          className="size-full -scale-x-100 object-cover"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-[28%] inset-y-[10%] rounded-[50%] border-2 border-dashed border-white/80"
        />
      </div>

      {phase.kind === 'intro' ? (
        <>
          <p className="max-w-prose text-ink-secondary">{t('detect.body')}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void start()}>{t('detect.start')}</Button>
            <Button variant="ghost" onClick={close}>
              {t('detect.cancel')}
            </Button>
          </div>
        </>
      ) : null}

      {live ? (
        <div className="space-y-2" aria-live="polite">
          <p>
            {phase.kind === 'measuring' && phase.turned
              ? t('detect.straight')
              : phase.kind === 'measuring'
                ? t('detect.measuring')
                : t('detect.starting')}
          </p>
          <div
            role="progressbar"
            aria-label={t('detect.measuring')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1.5 overflow-hidden rounded-pill bg-hairline"
          >
            <span
              className="block h-full bg-ink transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <Button variant="ghost" onClick={close}>
            {t('detect.cancel')}
          </Button>
        </div>
      ) : null}

      {phase.kind === 'result' ? (
        <div className="flex flex-wrap items-start gap-6">
          <FaceShapeFigure shape={phase.result.shape} className="h-28 w-auto text-ink" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-medium">
              {t('detect.confidence', { percent: Math.round(phase.result.confidence * 100) })}
            </p>
            {phase.result.confidence < 0.5 && phase.result.scores[1] ? (
              <p className="text-caption text-ink-secondary">
                {t('detect.between', {
                  other: t(`faceShapes.${phase.result.scores[1].shape}`).toLowerCase(),
                })}
              </p>
            ) : null}
            <p className="text-caption text-ink-secondary">
              {t('detect.ratios', {
                length: fixed(phase.result.ratios.length),
                forehead: fixed(phase.result.ratios.forehead),
                jaw: fixed(phase.result.ratios.jaw),
              })}
            </p>
            {phase.widthMm ? (
              <p className="text-caption text-ink-secondary">
                {t('detect.width', { width: phase.widthMm })}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                onClick={() => {
                  const { shape } = phase.result;
                  router.push(
                    finderHref(
                      { ...answers, faceShape: shape, faceWidthMm: phase.widthMm },
                      { step: 1 },
                    ) as Route,
                  );
                }}
              >
                {t('detect.use', { shape: t(`faceShapes.${phase.result.shape}`) })}
              </Button>
              <Button variant="secondary" onClick={() => void start()}>
                {t('detect.again')}
              </Button>
              <Button variant="ghost" onClick={close}>
                {t('detect.cancel')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {phase.kind === 'error' ? (
        <div role="alert" className="space-y-3">
          <p className="text-ink-secondary">{tErrors(`${phase.problem}.body`)}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void start()}>{t('detect.retry')}</Button>
            <Button variant="ghost" onClick={close}>
              {t('detect.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      <p className="text-caption text-ink-secondary">{t('detect.privacy')}</p>
    </section>
  );
}
