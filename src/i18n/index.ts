import en from './en';

export type Lang = 'en';

const translations: Record<Lang, typeof en> = { en };

export function getTranslation(lang: Lang) {
  return translations[lang] || translations.en;
}

export function getLangs(): Lang[] {
  return ['en'];
}

export function getLangFromUrl(_url: URL): Lang {
  return 'en';
}

export function getPathWithoutLocale(url: URL): string {
  return url.pathname;
}

export function localizedPath(_lang: Lang, path: string): string {
  return path === '/' ? '/' : path;
}
