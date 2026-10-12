import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

import { randomBytes } from '@/lib/random';

import { checkAddress, claimOwnerToken, registerOwner, RemoteBackupError } from './remote';
import {
  clearClaim,
  clearPending,
  getClaim,
  getPending,
  setAddress,
  setClaim,
  setEmail,
  setPending,
  setToken,
} from './remote-config';

/**
 * Rejestracja półki na serwerze adresem e-mail.
 *
 * Dwa sekrety, każdy w innym kanale, bo każdy odpowiada na inne pytanie. **Kod** jedzie pocztą
 * i dowodzi, że ktoś czyta tę skrzynkę. **Sekret telefonu** nigdzie nie jedzie — zostaje tutaj —
 * i dowodzi, że to ten sam telefon, który rejestrację zaczął; na serwer idzie z niego tylko
 * hasz. Dzięki temu dostęp do skrzynki sam nie wystarcza, żeby przejąć czyjeś kopie, a token
 * nigdy nie pojawia się w poczcie, która zostaje w skrzynce na lata.
 *
 * Czego e-mail **nie** daje: hasła do kopii. Ponowna rejestracja tego samego adresu odzyskuje
 * token, czyli dostęp do półki, ale koperty na niej otwiera wyłącznie hasło — i tu nie ma
 * żadnej furtki.
 */

/**
 * Hasz sekretu. Liczony z **tekstu szesnastkowego**, nie z bajtów, które ten tekst opisuje —
 * serwer robi dokładnie to samo (`hash('sha256', $claim)` na przysłanym łańcuchu). Dwie strony
 * muszą się tu zgadzać do znaku, bo rozjazd objawiłby się dopiero przy odbiorze tokena:
 * rejestracja wyglądałaby na udaną, a telefon nigdy nie znalazłby swojego zgłoszenia. Stąd test
 * na wartość policzoną w PHP.
 */
export const claimHash = (claim: string): string => bytesToHex(sha256(utf8ToBytes(claim)));

/** Na oko sprawdzamy tylko kształt adresu; prawdę o nim mówi dopiero list, który przychodzi. */
const looksLikeEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

/**
 * Zgłasza adres i prosi serwer o list z potwierdzeniem. Zwraca, ile godzin link będzie ważny.
 *
 * Sekret odkładamy **po** udanej wysyłce: zapisany wcześniej zostawiałby po nieudanej próbie
 * rejestrację, której na serwerze nie ma, a ekran czekałby na potwierdzenie listu, który nigdy
 * nie wyszedł.
 */
export async function startRegistration(args: {
  address: string;
  inviteToken: string;
  email: string;
}): Promise<number> {
  const address = checkAddress(args.address);
  const email = args.email.trim().toLowerCase();
  if (!looksLikeEmail(email)) {
    throw new RemoteBackupError('Podaj poprawny adres e-mail — na niego przyjdzie potwierdzenie.');
  }
  const inviteToken = args.inviteToken.trim();
  if (inviteToken === '') {
    throw new RemoteBackupError('Podaj token zaproszenia otrzymany od administratora skrytki.');
  }

  const claim = bytesToHex(randomBytes(32));
  const { hours } = await registerOwner({ address, token: inviteToken }, email, claimHash(claim));
  await setClaim(claim);
  setPending({ address, email });
  return hours;
}

export class NoRegistrationError extends Error {
  constructor() {
    super('Nie ma rozpoczętej rejestracji. Zgłoś adres jeszcze raz.');
  }
}

/**
 * Próbuje odebrać token. `pending` znaczy „adres jeszcze niepotwierdzony” i jest zwyczajnym
 * wynikiem, a nie błędem — list bywa czytany po godzinach.
 *
 * Kolejność zapisów nie jest obojętna: token idzie przed adresem, bo obecność adresu jest dla
 * reszty aplikacji znakiem „skrytka gotowa”. Odwrotnie, przerwanie w pół drogi zostawiałoby
 * skrytkę, która wygląda na podłączoną i wywraca się przy pierwszej kopii.
 */
export async function finishRegistration(): Promise<'pending' | 'ready'> {
  const pending = getPending();
  const claim = await getClaim();
  if (pending === null || claim === null) throw new NoRegistrationError();

  const result = await claimOwnerToken(pending.address, claim);
  if (result.status === 'pending') return 'pending';

  await setToken(result.token);
  setEmail(pending.email);
  setAddress(pending.address);
  // Sekret i zgłoszenie są już zużyte — serwer wydaje token dokładnie raz.
  await clearClaim();
  clearPending();
  return 'ready';
}
