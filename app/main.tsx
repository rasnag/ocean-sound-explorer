import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from './page';
import MakeMoon from './MakeMoon';
import './globals.css';
const isMoon=window.location.pathname.replace(/\/$/,'')==='/make-the-moon';
createRoot(document.getElementById('root')!).render(isMoon?<MakeMoon/>:<Home/>);
