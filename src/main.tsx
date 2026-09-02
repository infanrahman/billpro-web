import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './i18n';
import ErrorBoundary from './components/ErrorBoundary';
import { MotionConfig } from 'framer-motion';
import { enableAutomaticWebTrackingSync } from './services/webTrackingSyncService';

// Seed default business details for ZATCA
const defaultDetails = {
  name: "مؤسسة ناجل عسير",
  address: "Saudi Arabia",
  phone: "",
  email: "",
  gstin: "301191281700003",
  vatNo: "301191281700003",
  crNo: "7053305699",
  country: "Saudi Arabia",
  taxName: "VAT"
};
localStorage.setItem('businessDetails', JSON.stringify(defaultDetails));
enableAutomaticWebTrackingSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MotionConfig transition={{ duration: 0 }} reducedMotion="always">
        <App />
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
