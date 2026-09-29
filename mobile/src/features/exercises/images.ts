import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

const imagesDir = () => new Directory(Paths.document, 'exercise-images');

/** Wybór zdjęcia z galerii i skopiowanie go do katalogu aplikacji (działa offline). Zwraca URI lub null. */
export async function pickExerciseImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const dir = imagesDir();
  dir.create({ idempotent: true, intermediates: true });
  const source = new File(result.assets[0].uri);
  const extension = source.extension || '.jpg';
  const target = new File(dir, `${Date.now()}${extension}`);
  source.copy(target);
  return target.uri;
}

/** Usuwa zdjęcie, jeśli należy do katalogu aplikacji (nie ruszamy zasobów wbudowanych). */
export function deleteExerciseImage(uri: string | null) {
  if (!uri || !uri.startsWith(imagesDir().uri)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
