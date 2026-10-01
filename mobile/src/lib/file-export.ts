import { Directory, File } from 'expo-file-system';

// Zapis i odczyt plików przez systemowy wybór miejsca. Plik trafia tam, gdzie wskaże
// użytkownik (pamięć telefonu, Dysk Google), więc przeżywa odinstalowanie aplikacji.

export class ExportCanceled extends Error {
  constructor() {
    super('Anulowano');
  }
}

/** Zapisuje plik we wskazanym katalogu. Zwraca nazwę zapisanego pliku. */
export async function saveToPickedDirectory(
  contents: string | Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch {
    // Anulowanie okna systemowego zgłaszane jest wyjątkiem.
    throw new ExportCanceled();
  }
  const file = directory.createFile(fileName, mimeType);
  file.write(contents);
  return file.name || fileName;
}

/** Wczytuje treść wybranego pliku tekstowego. */
export async function readPickedTextFile(mimeTypes: string[]): Promise<string> {
  const picked = await File.pickFileAsync({ mimeTypes }).catch(() => {
    throw new ExportCanceled();
  });
  if (picked.canceled || !picked.result) throw new ExportCanceled();
  return picked.result.text();
}
