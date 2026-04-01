import en from './en';
import es from './es';
import pt from './pt';
import de from './de';
import fr from './fr';

export type Lang = 'en' | 'es' | 'pt' | 'de' | 'fr';

const translations: Record<Lang, typeof en> = { en, es, pt, de, fr };

export function getTranslation(lang: Lang) {
  return translations[lang] || translations.en;
}

export function getLangs(): Lang[] {
  return ['en', 'es', 'pt', 'de', 'fr'];
}

export function getLangFromUrl(url: URL): Lang {
  const segments = url.pathname.split('/').filter(Boolean);
  const first = segments[0] as Lang;
  if (['es', 'pt', 'de', 'fr'].includes(first)) return first;
  return 'en';
}

// Get the path without locale prefix (for building links to other locales)
export function getPathWithoutLocale(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (['es', 'pt', 'de', 'fr'].includes(first)) {
    return '/' + segments.slice(1).join('/');
  }
  return url.pathname;
}

// Build a localized path
export function localizedPath(lang: Lang, path: string): string {
  const cleanPath = path === '/' ? '' : path;
  if (lang === 'en') return cleanPath || '/';
  return `/${lang}${cleanPath}` || `/${lang}`;
}
