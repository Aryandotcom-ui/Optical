'use client';

import {
  classifyFaceShape,
  faceRatios,
  faceWidthMm,
  FacePoints,
  headPose,
  landmarkBasis,
  matrixBasis,
  measureFace,
  quaternionAngle,
  quaternionFromBasis,
} from '@optical/shared/face';
import { useEffect, useRef, useState } from 'react';
import { openCamera, stopCamera } from './engine/camera';
import { FaceTracker } from './engine/tracker';

interface Readout {
  fps: number;
  delegate: string;
  detectMs: number;
  faceWidth: number;
  pxPerMm: number;
  shape: string;
  confidence: number;
  ratios: string;
  matrixVsLandmarks: number | null;
}

/** Developer view: landmarks, tracker speed and the measurements try-on relies on. */
export default function TryOnDebugView() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let tracker: FaceTracker | null = null;
    let running = true;
    let frames = 0;
    let windowStart = performance.now();
    let fps = 0;
    const element = video.current;
    const overlay = canvas.current;
    if (!element || !overlay) return;
    void (async () => {
      try {
        stream = await openCamera(element);
        tracker = await FaceTracker.create('VIDEO');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        return;
      }
      const context = overlay.getContext('2d');
      const tick = async () => {
        if (!running || !tracker || !context) return;
        const width = element.videoWidth;
        const height = element.videoHeight;
        overlay.width = width;
        overlay.height = height;
        const started = performance.now();
        const frame = await tracker.detectVideo(element, started);
        const detectMs = performance.now() - started;
        context.clearRect(0, 0, width, height);
        frames += 1;
        if (started - windowStart >= 1000) {
          fps = Math.round((frames * 1000) / (started - windowStart));
          frames = 0;
          windowStart = started;
        }
        if (frame) {
          context.fillStyle = '#0A66FF';
          for (const point of frame.landmarks)
            context.fillRect(point.x * width - 1, point.y * height - 1, 2, 2);
          const m = measureFace(frame.landmarks, width, height);
          const result = classifyFaceShape(faceRatios(m));
          const pose = headPose(frame.landmarks, width, height, { matrix: frame.matrix });
          const fromLandmarks = quaternionFromBasis(
            ...landmarkBasis(new FacePoints(frame.landmarks, width, height)),
          );
          const basis = frame.matrix ? matrixBasis(frame.matrix) : null;
          setReadout({
            fps,
            delegate: tracker.delegate,
            detectMs: Math.round(detectMs * 10) / 10,
            faceWidth: Math.round(faceWidthMm(m)),
            pxPerMm: Math.round(pose.pxPerMm * 100) / 100,
            shape: result.shape,
            confidence: Math.round(result.confidence * 100),
            ratios: `L ${result.ratios.length.toFixed(2)} · F ${result.ratios.forehead.toFixed(2)} · J ${result.ratios.jaw.toFixed(2)}`,
            matrixVsLandmarks: basis
              ? Math.round(quaternionAngle(quaternionFromBasis(...basis), fromLandmarks) * 10) / 10
              : null,
          });
        }
        element.requestVideoFrameCallback(() => void tick());
      };
      void tick();
    })();
    return () => {
      running = false;
      stopCamera(stream, element);
      tracker?.close();
    };
  }, []);

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="relative w-full max-w-3xl">
        <video ref={video} muted playsInline className="w-full -scale-x-100" />
        <canvas ref={canvas} className="absolute inset-0 size-full -scale-x-100" />
      </div>
      <dl
        className="tabular grid max-w-3xl grid-cols-2 gap-x-6 gap-y-1 text-caption sm:grid-cols-3"
        data-testid="debug-readout"
      >
        {readout
          ? Object.entries(readout).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2 border-b border-hairline py-1">
                <dt className="text-ink-secondary">{key}</dt>
                <dd className="font-medium">{String(value)}</dd>
              </div>
            ))
          : null}
      </dl>
    </div>
  );
}
