'use client';

import dynamic from 'next/dynamic';

export const TryOnDebug = dynamic(() => import('./debug-view'), { ssr: false });
