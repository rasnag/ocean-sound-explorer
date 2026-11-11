import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from './page';
import MakeMoon from './MakeMoon';
import About from './About';
import LoopPreview from './LoopPreview';
import LoopPlayer from './LoopPlayer';
import {isSyntheticPreviewEnabled} from '../lib/loop/client-mode.mjs';
import './globals.css';

const previewEnabled = isSyntheticPreviewEnabled({
  DEV: import.meta.env.DEV,
  MODE: import.meta.env.MODE,
  VITE_LOOP_PREVIEW: import.meta.env.VITE_LOOP_PREVIEW,
});
const path = window.location.pathname.replace(/\/$/, '') || '/';
const page = path === '/make-the-moon' ? <MakeMoon/>
  : path === '/ocean-sound-explorer' ? <Home/>
  : path === '/loop-preview' && previewEnabled ? <LoopPreview/>
  : path === '/loop-preview/player' && previewEnabled ? <LoopPlayer/>
  : <About/>;
createRoot(document.getElementById('root')!).render(page);
