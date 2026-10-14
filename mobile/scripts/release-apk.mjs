#!/usr/bin/env node
/**
 * Wydanie APK na GitHubie — stały adres dla znajomych.
 *
 * Plik z EAS leży pod linkiem, który wygasa po trzydziestu dniach, więc wysłany raz na WhatsAppie
 * przestaje działać w połowie miesiąca. Wydanie na GitHubie nie wygasa i ma zawsze ten sam adres:
 * `…/releases/latest` prowadzi do najnowszego pliku, cokolwiek jest w środku.
 *
 * Skrypt nic nie buduje. Bierze ostatni gotowy build z EAS, pobiera z niego plik APK i wystawia
 * wydanie z listą zmian — tą samą, którą ma historia repozytorium, żeby nie trzeba było jej pisać
 * drugi raz z pamięci.
 *
 * Uruchomienie:
 *   npm run release:friends                  — ostatni gotowy build z profilu `friends`
 *   node scripts/release-apk.mjs preview     — albo z innego profilu
 *
 * Logowanie do GitHuba: `gh auth login` (wtedy skrypt nie potrzebuje niczego więcej) albo token
 * w zmiennej GITHUB_TOKEN z uprawnieniem do zapisu zawartości repozytorium.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
/** Sprawdzenie bez skutków: co poszłoby do wydania, bez pobierania pliku i bez pisania na GitHuba. */
const dryRun = args.includes('--dry-run');
const profile = args.find((arg) => !arg.startsWith('--')) ?? 'friends';
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;

/**
 * Polecenie z wynikiem na wyjściu; rzuca, gdy się nie powiodło.
 *
 * Powłoka tylko tam, gdzie musi: na Windowsie `npx` to plik .cmd i inaczej się nie uruchomi, ale
 * wszystko inne idzie bez niej — argument ze spacją w środku rozpadłby się na dwa.
 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} zakończone kodem ${result.status}: ${result.stderr?.trim() ?? ''}`);
  }
  return result.stdout?.trim() ?? '';
}

const has = (command) => spawnSync(command, ['--version']).status === 0;

/** Właściciel i nazwa repozytorium z adresu `origin`. */
function repository() {
  const url = run('git', ['remote', 'get-url', 'origin']);
  const match = /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
  if (match === null) throw new Error(`Z adresu „${url}” nie wynika repozytorium na GitHubie.`);
  return { owner: match[1], repo: match[2] };
}

/** Ostatni gotowy build z danego profilu — ten, którego plik ma trafić do wydania. */
function latestBuild() {
  const raw = run(
    'npx eas-cli@latest build:list --platform android --limit 20 --non-interactive --json',
    [],
    { shell: true },
  );
  const builds = JSON.parse(raw.slice(raw.indexOf('[')));
  const found = builds.find(
    (build) =>
      build.buildProfile === profile
      && build.status === 'FINISHED'
      && build.artifacts?.buildUrl,
  );
  if (found === undefined) throw new Error(`Brak gotowego builda z profilu „${profile}”.`);
  return found;
}

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub odpowiedział ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

/** Wydania, które już są — po to, żeby nie wystawić drugi raz tego samego i mieć punkt odniesienia. */
async function existingReleases({ owner, repo }) {
  if (token !== null) return github(`/repos/${owner}/${repo}/releases?per_page=10`);
  const raw = run('gh', [
    'api',
    `/repos/${owner}/${repo}/releases?per_page=10`,
  ]);
  return JSON.parse(raw);
}

/**
 * Lista zmian od poprzedniego wydania do commitu, z którego powstał ten build — a nie do dzisiaj.
 * W pliku jest to, co było w repozytorium w dniu budowania, i wydanie ma mówić o tym samym.
 *
 * Same tytuły commitów: treść jest dla mnie, tytuły dla czytającego.
 */
function changes(previousCommit, buildCommit) {
  const range = previousCommit === null ? buildCommit : `${previousCommit}..${buildCommit}`;
  try {
    const log = run('git', ['log', range, '-15', '--format=- %s', '--no-merges']);
    return log === '' ? '- Drobne poprawki.' : log;
  } catch {
    // Commit poprzedniego wydania może nie istnieć w tym klonie — wtedy lepiej puste niż błędne.
    return '- Lista zmian niedostępna.';
  }
}

async function main() {
  if (!dryRun && token === null && !has('gh')) {
    throw new Error(
      'Nie ma jak się zalogować do GitHuba. Albo `gh auth login` (GitHub CLI), albo token'
        + ' z uprawnieniem do zapisu zawartości w zmiennej GITHUB_TOKEN.',
    );
  }

  const { owner, repo } = repository();
  const build = latestBuild();
  const tag = `v${build.appVersion}-${build.appBuildVersion}`;
  const name = `FormaSync ${build.appVersion} (${build.appBuildVersion})`;

  const releases = token === null && !has('gh') ? [] : await existingReleases({ owner, repo });
  if (releases.some((release) => release.tag_name === tag)) {
    console.log(`Wydanie ${tag} już jest — nie ma czego wystawiać drugi raz.`);
    return;
  }

  const previous = releases[0]?.target_commitish ?? null;
  const body = [
    changes(previous, build.gitCommitHash),
    '',
    `Plik APK niżej. Instalacja: pobierz, otwórz, zgódź się na „instalowanie z nieznanych źródeł”.`,
    `Późniejsze poprawki dochodzą same — tego pliku nie trzeba pobierać za każdym razem.`,
  ].join('\n');

  if (dryRun) {
    console.log(`${name} → ${tag}`);
    console.log(`build ${build.id.slice(0, 8)}, commit ${build.gitCommitHash?.slice(0, 8)}`);
    console.log(`plik: ${build.artifacts.buildUrl}`);
    console.log(`---
${body}
---`);
    return;
  }

  console.log(`Pobieram plik z builda ${build.id.slice(0, 8)} (${tag})…`);
  const response = await fetch(build.artifacts.buildUrl);
  if (!response.ok) {
    throw new Error(
      `Plik z EAS jest nie do pobrania (${response.status}). Linki wygasają po trzydziestu dniach`
        + ' — wtedy trzeba zbudować na nowo.',
    );
  }
  const apk = join(mkdtempSync(join(tmpdir(), 'formasync-')), `FormaSync-${tag}.apk`);
  writeFileSync(apk, Buffer.from(await response.arrayBuffer()));

  if (token === null) {
    const notes = join(mkdtempSync(join(tmpdir(), 'formasync-')), 'notes.md');
    writeFileSync(notes, body);
    run(
      'gh',
      [
        'release', 'create', tag, apk,
        '--repo', `${owner}/${repo}`,
        '--title', name,
        '--notes-file', notes,
        '--target', build.gitCommitHash,
      ],
      { stdio: 'inherit' },
    );
  } else {
    const release = await github(`/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: build.gitCommitHash,
        name,
        body,
      }),
    });
    const upload = release.upload_url.replace(/\{.*\}$/, '');
    const uploaded = await fetch(`${upload}?name=FormaSync-${tag}.apk`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/vnd.android.package-archive',
      },
      body: readFileSync(apk),
    });
    if (!uploaded.ok) {
      throw new Error(`Nie udało się dołączyć pliku: ${uploaded.status} ${await uploaded.text()}`);
    }
  }

  console.log(`Gotowe: https://github.com/${owner}/${repo}/releases/latest`);
  console.log('Ten adres zawsze prowadzi do najnowszego wydania — ten sam link dla znajomych.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
