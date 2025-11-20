import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from '../i18n/en';
import es from '../i18n/es';

const LanguageContext = createContext(null);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    // Fallback: safe defaults when no LanguageProvider is present
    const fallbackTranslate = (key) => {
      const keys = key.split('.');
      let value = en;
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          console.warn(`Translation key not found (fallback): ${key}`);
          return key;
        }
      }
      return value;
    };

    return {
      language: 'en',
      changeLanguage: () => {},
      t: fallbackTranslate,
      loading: false,
    };
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('en');
  const [translations, setTranslations] = useState(en);
  const [loading, setLoading] = useState(true);
  const [userLanguageSynced, setUserLanguageSynced] = useState(false);

  // Load saved language preference on mount
  useEffect(() => {
    loadLanguage();
  }, []);

  // Sync with user's saved language from database when user logs in
  useEffect(() => {
    const syncUserLanguage = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser && !userLanguageSynced) {
          const user = JSON.parse(storedUser);
          if (user.language && (user.language === 'en' || user.language === 'es')) {
            if (user.language !== language) {
              console.log('[LanguageContext] Syncing user language:', user.language);
              setLanguage(user.language);
              setTranslations(user.language === 'es' ? es : en);
              await AsyncStorage.setItem('language', user.language);
            }
            setUserLanguageSynced(true);
          }
        }
      } catch (error) {
        console.error('Error syncing user language:', error);
      }
    };

    syncUserLanguage();
  }, [language, userLanguageSynced]);

  const loadLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem('language');
      if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'es')) {
        setLanguage(savedLanguage);
        setTranslations(savedLanguage === 'es' ? es : en);
      }
    } catch (error) {
      console.error('Error loading language:', error);
    } finally {
      setLoading(false);
    }
  };

  const changeLanguage = async (newLanguage) => {
    try {
      if (newLanguage !== 'en' && newLanguage !== 'es') {
        console.warn('Unsupported language:', newLanguage);
        return;
      }
      
      setLanguage(newLanguage);
      setTranslations(newLanguage === 'es' ? es : en);
      await AsyncStorage.setItem('language', newLanguage);
    } catch (error) {
      console.error('Error changing language:', error);
    }
  };

  const t = (key) => {
    const keys = key.split('.');
    let value = translations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        console.warn(`Translation key not found: ${key}`);
        return key;
      }
    }
    
    return value;
  };

  const value = {
    language,
    changeLanguage,
    t,
    loading,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
