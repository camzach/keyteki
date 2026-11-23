import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import localeEn from './locales/en.json';

i18n.use(initReactI18next).init({
    resources: { en: { translation: localeEn } },
    lng: 'en',
    fallbackLng: 'en',
    debug: false,
    interpolation: {
        escapeValue: false
    },
    keySeparator: false,
    nsSeparator: false
});

export default i18n;
