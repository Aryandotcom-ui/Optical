'use client';

import {
  measureFace,
  medianReading,
  pdFromCard,
  pdFromIris,
  turnFromCamera,
  type FaceMeasurements,
} from '@optical/shared/face';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  FaceCamera,
  FaceCameraError,
  type FaceCameraProblem,
} from '@/components/try-on/engine/face-camera';
import type { FaceFrame } from '@/components/try-on/engine/tracker';
import { Button } from '@/components/ui/button';
import { savedPd } from '@/stores/pd';
import { CardEdges } from './card-edges';

/** Front-on frames combined for the iris estimate. */
const IRIS_SAMPLES = 20;
const MAX_TURN_DEGREES = 10;
const CARD_MM = 85.6;

type Phase =
  | { kind: 'intro' }
  | { kind: 'starting' }
  | { kind: 'live'; face: boolean }
  | { kind: 'iris'; samples: number }
  | { kind: 'card'; pupilPx: number; width: number; edges: [number, number] }
  | { kind: 'result'; pd: number; estimate: boolean }
  | { kind: 'problem'; message: 'noFace' | 'implausible' }
  | { kind: 'error'; problem: FaceCameraProblem };

/**
 * Measures PD on this device: either with a bank card on the forehead as
 * a ruler (the customer marks its edges on a still), or roughly from the
 * size of the irises. The camera image and landmarks never leave the tab.
 */
export default function PdMeasure({
  onUse,
  onClose,
}: {
  onUse: (pd: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations('configurator.pdHelper');
  const tErrors = useTranslations('tryOn.measureErrors');
  const videoRef = useRef<HTMLVideoElement>(null);
  const still = useRef<HTMLCanvasElement | null>(null);
  const camera = useRef<FaceCamera | null>(null);
  const latest = useRef<{ frame: FaceFrame; measured: FaceMeasurements } | null>(null);
  const irisReadings = useRef<(number | null)[] | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });

  useEffect(() => () => camera.current?.stop(), []);
  useEffect(() => {
    heading.current?.focus();
  }, [phase.kind]);

  const finishIris = (session: FaceCamera, readings: (number | null)[]) => {
    session.stop();
    irisReadings.current = null;
    const pd = medianReading(readings);
    setPhase(
      pd === null ? { kind: 'problem', message: 'noFace' } : { kind: 'result', pd, estimate: true },
    );
  };

  const start = async () => {
    const video = videoRef.current;
    if (!video) return;
    camera.current?.stop();
    latest.current = null;
    setPhase({ kind: 'starting' });
    const session = new FaceCamera(
      video,
      (frame) => {
        const { width, height } = session.size;
        const frontal =
          frame !== null &&
          turnFromCamera(frame.landmarks, width, height, frame.matrix) <= MAX_TURN_DEGREES;
        latest.current =
          frame && frontal
            ? { frame, measured: measureFace(frame.landmarks, width, height) }
            : null;
        const readings = irisReadings.current;
        if (readings) {
          if (latest.current)
            readings.push(
              pdFromIris(
                latest.current.measured.pupilDistance,
                latest.current.measured.irisDiameter,
              ),
            );
          if (readings.length >= IRIS_SAMPLES) finishIris(session, readings);
          else setPhase({ kind: 'iris', samples: readings.length });
          return;
        }
        setPhase((current) =>
          current.kind === 'live' && current.face === frontal
            ? current
            : { kind: 'live', face: frontal },
        );
      },
      () => {
        setPhase({ kind: 'intro' });
      },
    );
    camera.current = session;
    try {
      await session.start();
      setPhase({ kind: 'live', face: false });
    } catch (error) {
      setPhase({
        kind: 'error',
        problem: error instanceof FaceCameraError ? error.problem : 'unknown',
      });
    }
  };

  /** Freezes the current frame for marking the card's edges. */
  const capture = () => {
    const session = camera.current;
    const reading = latest.current;
    if (!session || !reading) {
      setPhase({ kind: 'problem', message: 'noFace' });
      return;
    }
    const canvas = document.createElement('canvas');
    if (!session.still(canvas)) return;
    // Read the size before stopping: a stopped video reports 0 × 0.
    const { width } = session.size;
    session.stop();
    still.current = canvas;
    // Start the markers where a card would be: centred between the eyes.
    const landmarks = reading.frame.landmarks;
    const centre = ((landmarks[468]?.x ?? 0.5) + (landmarks[473]?.x ?? 0.5)) / 2;
    const half = ((CARD_MM / 2) * (reading.measured.pupilDistance / 63)) / width;
    setPhase({
      kind: 'card',
      pupilPx: reading.measured.pupilDistance,
      width,
      edges: [Math.max(0, centre - half), Math.min(1, centre + half)],
    });
  };

  const confirmCard = () => {
    if (phase.kind !== 'card') return;
    const cardPx = Math.abs(phase.edges[1] - phase.edges[0]) * phase.width;
    const pd = pdFromCard(phase.pupilPx, cardPx);
    still.current = null;
    setPhase(
      pd === null
        ? { kind: 'problem', message: 'implausible' }
        : { kind: 'result', pd, estimate: false },
    );
  };

  const close = () => {
    camera.current?.stop();
    still.current = null;
    onClose();
  };

  const live = phase.kind === 'starting' || phase.kind === 'live' || phase.kind === 'iris';
  const cancel = (
    <Button variant="ghost" onClick={close}>
      {t('cancel')}
    </Button>
  );

  return (
    <section
      aria-labelledby="pd-measure-title"
      className="mt-4 space-y-4 rounded-card bg-surface p-4"
    >
      <h3
        id="pd-measure-title"
        ref={heading}
        tabIndex={-1}
        className="font-semibold text-ink focus:outline-none"
      >
        {phase.kind === 'result'
          ? t('result', { pd: phase.pd })
          : phase.kind === 'error'
            ? tErrors(`${phase.problem}.title`)
            : t('title')}
      </h3>

      <div
        className={
          live
            ? 'relative mx-auto aspect-[4/3] w-full max-w-lg overflow-hidden rounded-media bg-ink'
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
      </div>

      {phase.kind === 'intro' ? (
        <>
          <p className="text-caption text-ink-secondary">{t('body')}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void start()}>{t('start')}</Button>
            {cancel}
          </div>
        </>
      ) : null}

      {phase.kind === 'starting' ? <p aria-live="polite">{t('starting')}</p> : null}

      {phase.kind === 'live' ? (
        <>
          <p className="text-caption text-ink-secondary">{t('live')}</p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={!phase.face} onClick={capture}>
              {t('capture')}
            </Button>
            <Button
              variant="secondary"
              disabled={!phase.face}
              onClick={() => {
                irisReadings.current = [];
                setPhase({ kind: 'iris', samples: 0 });
              }}
            >
              {t('quick')}
            </Button>
            {cancel}
          </div>
        </>
      ) : null}

      {phase.kind === 'iris' ? (
        <p aria-live="polite">
          {t('measuringIris')} {Math.round((phase.samples / IRIS_SAMPLES) * 100)}%
        </p>
      ) : null}

      {phase.kind === 'card' ? (
        <>
          <p className="text-caption text-ink-secondary">{t('adjust')}</p>
          <CardEdges
            draw={(canvas) => {
              const source = still.current;
              if (!source) return;
              canvas.width = source.width;
              canvas.height = source.height;
              canvas.getContext('2d')?.drawImage(source, 0, 0);
            }}
            edges={phase.edges}
            onChange={(edges) => {
              setPhase({ ...phase, edges });
            }}
            labels={{ image: t('stillAlt'), left: t('leftEdge'), right: t('rightEdge') }}
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={confirmCard}>{t('confirm')}</Button>
            <Button variant="secondary" onClick={() => void start()}>
              {t('again')}
            </Button>
            {cancel}
          </div>
        </>
      ) : null}

      {phase.kind === 'result' ? (
        <>
          <p className="text-caption text-ink-secondary">{t('estimate')}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                savedPd.set(phase.pd);
                onUse(phase.pd);
              }}
            >
              {t('use', { pd: phase.pd })}
            </Button>
            <Button variant="secondary" onClick={() => void start()}>
              {t('again')}
            </Button>
            {cancel}
          </div>
          <p className="text-caption text-ink-secondary">{t('saved')}</p>
        </>
      ) : null}

      {phase.kind === 'problem' || phase.kind === 'error' ? (
        <div role="alert" className="space-y-3">
          <p className="text-ink-secondary">
            {phase.kind === 'problem' ? t(phase.message) : tErrors(`${phase.problem}.body`)}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void start()}>{t('retry')}</Button>
            {cancel}
          </div>
        </div>
      ) : null}

      <p className="text-caption text-ink-secondary">{t('privacy')}</p>
    </section>
  );
}
