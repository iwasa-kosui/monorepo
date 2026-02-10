import React from 'react';
import { createRoot } from 'react-dom/client';

import '../src/styles/index.css';
import './showcase.css';
import { App } from './App.js';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
