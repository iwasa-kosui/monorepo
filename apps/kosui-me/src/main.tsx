import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AboutPage } from './pages/AboutPage.tsx';
import { PostListPage } from './pages/PostListPage.tsx';
import { PostPage } from './pages/PostPage.tsx';
import { TalkListPage } from './pages/TalkListPage.tsx';

import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<PostListPage />} />
        <Route path='/talks' element={<TalkListPage />} />
        <Route path='/about' element={<AboutPage />} />
        <Route path='/posts/*' element={<PostPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
