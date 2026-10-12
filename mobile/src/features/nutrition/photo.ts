import * as ImagePicker from 'expo-image-picker';

/**
 * Zdjęcie posiłku do oszacowania.
 *
 * Nie zapisujemy go nigdzie: żyje w stanie ekranu do czasu zapisu posiłku i znika razem z nim.
 * Do bazy trafiają wyłącznie liczby, bo to one są potrzebne za miesiąc — a zdjęcie stołu to
 * zupełnie inna kategoria danych niż „owsianka, 420 kcal”.
 *
 * Kadrowanie jest włączone na stałe i nie jest kaprysem: pozwala odciąć wszystko poza talerzem,
 * zanim cokolwiek pojedzie do Google, a przy okazji poprawia rozpoznanie, bo w kadrze zostaje
 * jedzenie zamiast kuchni.
 */

/**
 * Ile bajtów zdjęcia jeszcze przyjmujemy. Całe zapytanie do Gemini ma limit 20 MB, a base64
 * puchnie o jedną trzecią — cztery megabajty zostawiają zapas i tak są grubo powyżej tego, co
 * daje aparat przy naszej jakości.
 */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** Niższa jakość to mniejsze zapytanie, a do rozpoznania jedzenia aż nadto. */
const QUALITY = 0.45;

export class PhotoError extends Error {}

export type MealPhoto = {
  /** Plik na telefonie — tylko do pokazania miniatury. */
  uri: string;
  mimeType: string;
  /** Zawartość w base64; to ona leci do Google. */
  data: string;
};

type PickedAsset = {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

/** Gemini przyjmuje te formaty; wybierak oddaje JPEG, reszta jest na wszelki wypadek. */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** Rozmiar pliku odtworzony z base64 — `fileSize` bywa pusty, a limit musi obowiązywać zawsze. */
export const bytesOf = (base64: string): number => Math.round((base64.length * 3) / 4);

/**
 * Zdjęcie z wybieraka na postać, którą da się wysłać. Osobno od samego wybierania, bo wybierak
 * jest modułem natywnym, a te sprawdzenia warto mieć pokryte testem.
 */
export function photoFrom(asset: PickedAsset): MealPhoto {
  const data = asset.base64 ?? '';
  if (data === '') throw new PhotoError('Nie udało się odczytać zdjęcia.');

  const mimeType = (asset.mimeType ?? 'image/jpeg').toLowerCase();
  if (!ALLOWED.includes(mimeType)) {
    throw new PhotoError('Tego formatu zdjęcia nie przyjmiemy. Zrób je aparatem w aplikacji.');
  }

  if (bytesOf(data) > MAX_PHOTO_BYTES) {
    throw new PhotoError('Zdjęcie jest za duże. Zrób je aparatem w aplikacji albo wybierz mniejsze.');
  }

  return { uri: asset.uri, mimeType, data };
}

const OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  quality: QUALITY,
  base64: true,
  exif: false,
};

/** Zdjęcie prosto z aparatu. Null, gdy ktoś się rozmyślił. */
export async function takeMealPhoto(): Promise<MealPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new PhotoError('Bez zgody na kamerę nie zrobimy zdjęcia. Można je wybrać z galerii.');
  }
  const result = await ImagePicker.launchCameraAsync(OPTIONS);
  return result.canceled || !result.assets?.[0] ? null : photoFrom(result.assets[0]);
}

/** Zdjęcie z galerii — na posiłek sfotografowany wcześniej. */
export async function pickMealPhoto(): Promise<MealPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync(OPTIONS);
  return result.canceled || !result.assets?.[0] ? null : photoFrom(result.assets[0]);
}
