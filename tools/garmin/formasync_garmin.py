#!/usr/bin/env python3
"""Wysyłka planów FormaSync do Garmin Connect.

Czyta kopię zapasową wyeksportowaną z aplikacji (Ustawienia → Zapisz kopię do pliku)
i tworzy z niej treningi siłowe w bibliotece Garmin Connect, opcjonalnie wpisując je
do kalendarza zgodnie z harmonogramem z aplikacji.

Korzysta z nieoficjalnego klienta `garminconnect`, który loguje się na Twoje konto
zapisanymi tokenami. Garmin może zmienić to API bez zapowiedzi.

Domyślnie nic nie wysyła — pokazuje, co by zrobił. Dopiero `--send` wykonuje zapis.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from garminconnect import Garmin
    from garminconnect.workout import (
        ConditionType,
        ExecutableStep,
        StepType,
        StrengthWorkout,
        TargetType,
        WEIGHT_UNIT_KILOGRAM,
        WorkoutSegment,
        create_repeat_group,
        create_strength_exercise_step,
        create_strength_rest_step,
    )
except ImportError as exc:  # pragma: no cover - zależy od środowiska użytkownika
    sys.exit(f"Brak zależności: {exc}. Zainstaluj: pip install -r requirements.txt")

SPORT_STRENGTH = {"sportTypeId": 5, "sportTypeKey": "strength_training"}
DEFAULT_TOKENSTORE = os.getenv("GARMINTOKENS", "~/.garminconnect")


# --- Odczyt kopii zapasowej ---------------------------------------------------


@dataclass
class PlanExercise:
    name: str
    category: str | None
    tracking: str
    sets: int
    reps: int | None
    weight_kg: float | None
    duration_seconds: int | None
    rest_seconds: int


@dataclass
class Plan:
    plan_id: int
    title: str
    exercises: list[PlanExercise]
    """Daty z kalendarza aplikacji (YYYY-MM-DD), na które plan jest zaplanowany."""
    scheduled_dates: list[str]


def load_backup(path: Path) -> list[Plan]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("app") != "FormaSync":
        sys.exit(f"{path} nie wygląda na kopię zapasową FormaSync.")
    tables = data.get("tables", {})

    exercises = {row["id"]: row for row in tables.get("exercises", [])}
    by_plan: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in tables.get("plan_exercises", []):
        by_plan[row["plan_id"]].append(row)

    schedule: dict[int, list[str]] = defaultdict(list)
    for row in tables.get("scheduled_workouts", []):
        schedule[row["plan_id"]].append(row["scheduled_date"])

    plans: list[Plan] = []
    for plan_row in tables.get("workout_plans", []):
        # Szablony wbudowane pomijamy — do Garmina trafiają tylko własne plany.
        if plan_row.get("is_template"):
            continue
        items = sorted(by_plan.get(plan_row["id"], []), key=lambda r: r["order_index"])
        if not items:
            continue
        plans.append(
            Plan(
                plan_id=plan_row["id"],
                title=plan_row["title"],
                exercises=[_to_exercise(item, exercises) for item in items],
                scheduled_dates=sorted(set(schedule.get(plan_row["id"], []))),
            )
        )
    return plans


def _to_exercise(item: dict[str, Any], exercises: dict[int, dict[str, Any]]) -> PlanExercise:
    exercise = exercises.get(item["exercise_id"], {})
    return PlanExercise(
        name=exercise.get("name", "Ćwiczenie"),
        category=exercise.get("garmin_category"),
        tracking=exercise.get("tracking_type", "REPS"),
        sets=item["target_sets"],
        reps=item.get("target_reps"),
        weight_kg=item.get("target_weight"),
        duration_seconds=item.get("target_duration_seconds"),
        rest_seconds=item.get("rest_duration_seconds") or 0,
    )


# --- Budowa treningu ----------------------------------------------------------


def timed_exercise_step(
    category: str | None,
    step_order: int,
    seconds: float,
    exercise_name: str = "",
    weight_kg: float | None = None,
) -> ExecutableStep:
    """Ćwiczenie na czas. Biblioteka ma builder tylko dla powtórzeń, więc krok
    budujemy tak samo, zamieniając warunek końca z powtórzeń na czas."""
    extra: dict[str, Any] = {"category": category or "UNKNOWN", "exerciseName": exercise_name}
    if weight_kg is not None:
        extra["weightValue"] = float(weight_kg) * 1000.0
        extra["weightUnit"] = dict(WEIGHT_UNIT_KILOGRAM)
    return ExecutableStep(
        stepOrder=step_order,
        stepType={"stepTypeId": StepType.INTERVAL, "stepTypeKey": "interval", "displayOrder": 3},
        endCondition={
            "conditionTypeId": ConditionType.TIME,
            "conditionTypeKey": "time",
            "displayOrder": 2,
            "displayable": True,
        },
        endConditionValue=float(seconds),
        targetType={
            "workoutTargetTypeId": TargetType.NO_TARGET,
            "workoutTargetTypeKey": "no.target",
            "displayOrder": 1,
        },
        **extra,
    )


def build_workout(plan: Plan) -> StrengthWorkout:
    steps: list[Any] = []
    order = 1
    for exercise in plan.exercises:
        if exercise.tracking == "TIME":
            work = timed_exercise_step(
                exercise.category,
                order + 1,
                exercise.duration_seconds or 30,
                weight_kg=exercise.weight_kg,
            )
        else:
            work = create_strength_exercise_step(
                exercise.category or "UNKNOWN",
                order + 1,
                exercise.reps or 1,
                weight_kg=exercise.weight_kg,
            )
        rest = create_strength_rest_step(exercise.rest_seconds, order + 2)
        steps.append(create_repeat_group(max(exercise.sets, 1), [work, rest], order))
        # Grupa plus dwa kroki w środku — kolejny blok zaczyna się trzy pozycje dalej.
        order += 3

    return StrengthWorkout(
        workoutName=plan.title[:80],
        estimatedDurationInSecs=0,
        workoutSegments=[
            WorkoutSegment(segmentOrder=1, sportType=dict(SPORT_STRENGTH), workoutSteps=steps)
        ],
    )


def plural(count: int, one: str, few: str, many: str) -> str:
    """Polska odmiana: 1 ćwiczenie, 2 ćwiczenia, 5 ćwiczeń."""
    last_two, last = count % 100, count % 10
    if count == 1:
        return one
    if 2 <= last <= 4 and not 12 <= last_two <= 14:
        return few
    return many


def describe(plan: Plan) -> str:
    count = len(plan.exercises)
    lines = [f"{plan.title}  ({count} {plural(count, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')})"]
    for exercise in plan.exercises:
        if exercise.tracking == "TIME":
            target = f"{exercise.sets} × {exercise.duration_seconds or 30} s"
        else:
            target = f"{exercise.sets} × {exercise.reps or '?'}"
        weight = f" @ {exercise.weight_kg} kg" if exercise.weight_kg else ""
        category = exercise.category or "BRAK KATEGORII"
        lines.append(f"   - {exercise.name}: {target}{weight}  [{category}, przerwa {exercise.rest_seconds} s]")
    if plan.scheduled_dates:
        lines.append(f"   terminy: {', '.join(plan.scheduled_dates)}")
    return "\n".join(lines)


# --- Połączenie ---------------------------------------------------------------


def connect(tokenstore: str) -> Garmin:
    api = Garmin()
    needs_mfa, _ = api.login(str(Path(tokenstore).expanduser()))
    if needs_mfa:
        sys.exit("Konto wymaga kodu dwuskładnikowego. Zaloguj się raz ręcznie, by odświeżyć tokeny.")
    return api


# --- Polecenia ----------------------------------------------------------------


def cmd_inspect(args: argparse.Namespace) -> None:
    api = connect(args.tokenstore)
    if args.id:
        payload = api.get_workout_by_id(args.id)
        print(json.dumps(payload, indent=2, ensure_ascii=False)[: args.chars])
        if args.out:
            Path(args.out).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"\nZapisano do {args.out}")
        return

    for item in api.get_workouts(0, args.limit):
        sport = (item.get("sportType") or {}).get("sportTypeKey", "?")
        print(f"{item.get('workoutId')}  {sport:20}  {item.get('workoutName')}")


def cmd_upload(args: argparse.Namespace) -> None:
    plans = load_backup(Path(args.backup))
    if args.plan:
        wanted = {name.lower() for name in args.plan}
        plans = [plan for plan in plans if plan.title.lower() in wanted]
    if not plans:
        sys.exit("Nie znalazłem planów do wysłania. Pamiętaj, że szablony są pomijane.")

    print(f"Planów do wysłania: {len(plans)}\n")
    for plan in plans:
        print(describe(plan))
        print()

    missing = [e.name for plan in plans for e in plan.exercises if not e.category]
    if missing:
        print(f"Uwaga: bez kategorii Garmin ({len(missing)}): {', '.join(sorted(set(missing)))}")
        print("Takie ćwiczenia trafią na zegarek jako nieokreślone.\n")

    if not args.send:
        print("To był podgląd. Dodaj --send, aby wysłać do Garmin Connect.")
        return

    api = connect(args.tokenstore)
    for plan in plans:
        result = api.upload_workout(build_workout(plan).to_dict())
        workout_id = result.get("workoutId")
        print(f"Wysłano: {plan.title} → workoutId {workout_id}")

        if args.schedule:
            for date_str in plan.scheduled_dates:
                api.schedule_workout(workout_id, date_str)
                print(f"   zaplanowano na {date_str}")
        if args.push:
            api.push_workout_to_device(workout_id)
            print("   wypchnięto na zegarek")

        # Odpowiedź 201 mówi tylko, że serwer przyjął dane — sprawdzamy, co faktycznie zapisał.
        saved = api.get_workout_by_id(workout_id)
        segments = saved.get("workoutSegments") or [{}]
        print(f"   weryfikacja: kroków {len(segments[0].get('workoutSteps', []))}")


def main() -> None:
    # Konsola Windows domyślnie nie używa UTF-8, przez co polskie znaki się sypią.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tokenstore", default=DEFAULT_TOKENSTORE, help="katalog z tokenami Garmin")
    sub = parser.add_subparsers(dest="command", required=True)

    inspect_cmd = sub.add_parser("inspect", help="podejrzyj treningi na koncie Garmin")
    inspect_cmd.add_argument("--limit", type=int, default=20)
    inspect_cmd.add_argument("--id", help="pokaż pełną strukturę jednego treningu")
    inspect_cmd.add_argument("--out", help="zapisz strukturę do pliku")
    inspect_cmd.add_argument("--chars", type=int, default=4000, help="ile znaków wypisać")
    inspect_cmd.set_defaults(func=cmd_inspect)

    upload_cmd = sub.add_parser("upload", help="wyślij plany z kopii zapasowej")
    upload_cmd.add_argument("--backup", required=True, help="plik kopii zapasowej z aplikacji")
    upload_cmd.add_argument("--plan", action="append", help="nazwa planu (można podać wielokrotnie)")
    upload_cmd.add_argument("--send", action="store_true", help="faktycznie wyślij (domyślnie tylko podgląd)")
    upload_cmd.add_argument("--schedule", action="store_true", help="wpisz też terminy do kalendarza Garmin")
    upload_cmd.add_argument("--push", action="store_true", help="wypchnij trening na zegarek od razu")
    upload_cmd.set_defaults(func=cmd_upload)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
