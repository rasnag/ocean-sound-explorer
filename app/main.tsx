import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from './page';
import MakeMoon from './MakeMoon';
import About from './About';
import './globals.css';
const path=window.location.pathname.replace(/\/$/,'')||'/';
const page=path==='/make-the-moon'?<MakeMoon/>:path==='/ocean-sound-explorer'?<Home/>:<About/>;
createRoot(document.getElementById('root')!).render(page);
