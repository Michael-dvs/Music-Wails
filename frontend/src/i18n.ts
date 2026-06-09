import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import translationEN from './locales/en.json';
import translationID from './locales/id.json';

// Get initial preference from localStorage if set, otherwise detect
const savedPref = localStorage.getItem('appLanguagePref') || 'system';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: translationEN,
      },
      id: {
        translation: translationID,
      },
    },
    // If the detected language starts with 'id', use 'id'. Otherwise, fallback to 'en'.
    fallbackLng: (code) => {
      if (code && code.startsWith('id')) {
        return ['id'];
      }
      return ['en'];
    },
    interpolation: {
      escapeValue: false, // React already safeguards from XSS
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

// Apply user manual preference if saved
if (savedPref !== 'system') {
  i18n.changeLanguage(savedPref);
} else {
  // If 'system', ensure the detector's output complies with our id/en rule
  const detected = i18n.language;
  if (detected && !detected.startsWith('id') && !detected.startsWith('en')) {
    i18n.changeLanguage('en');
  }
}

export default i18n;
