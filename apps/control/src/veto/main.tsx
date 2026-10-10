import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import './veto.css';
import { VetoApp } from './VetoApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VetoApp />
  </StrictMode>
);
