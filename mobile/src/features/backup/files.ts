import { Directory, File } from 'expo-file-system';

// Zapis i odczyt kopii przez systemowy wybór miejsca. Plik trafia tam, gdzie wskaże
// użytkownik (np. Dysk Google albo pamięć telefonu), więc przeżywa odinstalowanie aplikacji.

export class BackupCanceled extends Error {
  constructor() {
    super('Anulowano');
  }
}

/** Zapisuje kopię we wskazanym katalogu. Zwraca nazwę zapisanego pliku. */
export async function writeBackupFile(contents: string, fileName: string): Promise<string> {
  const directory = await pickDirectory();
  const file = directory.createFile(fileName, 'application/json');
  file.write(contents);
  return file.name || fileName;
}

async function pickDirectory(): Promise<Directory> {
  try {
    return await Directory.pickDirectoryAsync();
  } catch {
    // Anulowanie okna systemowego zgłaszane jest wyjątkiem.
    throw new BackupCanceled();
  }
}

/** Wczytuje treść wybranego pliku kopii. */
export async function readBackupFile(): Promise<string> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', '*/*'] }).catch(
    () => {
      throw new BackupCanceled();
    },
  );
  if (picked.canceled || !picked.result) throw new BackupCanceled();
  return picked.result.text();
}
