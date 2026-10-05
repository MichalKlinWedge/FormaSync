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
        CyclingWorkout,
        ExecutableStep,
        RunningWorkout,
        StepType,
        StrengthWorkout,
        SwimmingWorkout,
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
# Kolejność jak w innych projektach korzystających z tych samych tokenów.
DEFAULT_TOKENSTORE = (
    os.getenv("GARMIN_TOKEN_STORE") or os.getenv("GARMINTOKENS") or "~/.garminconnect"
)


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
    sport: str
    exercises: list[PlanExercise]
    segments: list["Segment"]
    """Daty z kalendarza aplikacji (YYYY-MM-DD), na które plan jest zaplanowany."""
    scheduled_dates: list[str]


def field(row: dict[str, Any], *names: str, default: Any = None) -> Any:
    """Odczyt pola niezależnie od zapisu nazw.

    Kopia zapasowa zapisuje nazwy w zapisie camelCase (`planId`), bo takie nazwy nadaje
    warstwa dostępu do bazy w aplikacji. Przyjmujemy też zapis z podkreśleniami, żeby
    starsze pliki nie przestały działać.
    """
    for name in names:
        if name in row:
            return row[name]
    return default


def load_backup(path: Path) -> list[Plan]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("app") != "FormaSync":
        sys.exit(f"{path} nie wygląda na kopię zapasową FormaSync.")
    tables = data.get("tables", {})

    exercises = {row["id"]: row for row in tables.get("exercises", [])}
    by_plan: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in tables.get("plan_exercises", []):
        by_plan[field(row, "planId", "plan_id")].append(row)

    segments_by_plan: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in tables.get("plan_segments", []):
        segments_by_plan[field(row, "planId", "plan_id")].append(row)

    schedule: dict[int, list[str]] = defaultdict(list)
    for row in tables.get("scheduled_workouts", []):
        schedule[field(row, "planId", "plan_id")].append(field(row, "scheduledDate", "scheduled_date"))

    plans: list[Plan] = []
    for plan_row in tables.get("workout_plans", []):
        # Szablony wbudowane pomijamy — do Garmina trafiają tylko własne plany.
        if field(plan_row, "isTemplate", "is_template"):
            continue
        sport = field(plan_row, "sport", default="STRENGTH") or "STRENGTH"
        items = sorted(by_plan.get(plan_row["id"], []), key=lambda r: field(r, "orderIndex", "order_index", default=0))
        segments = _to_segments(segments_by_plan.get(plan_row["id"], []))
        # Plan bez treści nie ma czego wysłać.
        if not items and not segments:
            continue
        plans.append(
            Plan(
                plan_id=plan_row["id"],
                title=plan_row["title"],
                sport=sport,
                exercises=[_to_exercise(item, exercises) for item in items],
                segments=segments,
                scheduled_dates=sorted(set(schedule.get(plan_row["id"], []))),
            )
        )
    return plans


def _to_segments(rows: list[dict[str, Any]]) -> list[Segment]:
    """Płaska lista z kopii zapasowej z powrotem w drzewo: grupa i jej wnętrze."""
    ordered = sorted(rows, key=lambda r: field(r, "orderIndex", "order_index", default=0))
    by_parent: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for row in ordered:
        by_parent[field(row, "parentId", "parent_id")].append(row)

    def build(row: dict[str, Any]) -> Segment:
        return Segment(
            kind=field(row, "kind", default="WORK"),
            repeat_count=field(row, "repeatCount", "repeat_count"),
            duration_type=field(row, "durationType", "duration_type", default="OPEN"),
            distance_meters=field(row, "distanceMeters", "distance_meters"),
            duration_seconds=field(row, "durationSeconds", "duration_seconds"),
            target_type=field(row, "targetType", "target_type", default="NONE"),
            target_low=field(row, "targetLow", "target_low"),
            target_high=field(row, "targetHigh", "target_high"),
            children=[build(child) for child in by_parent.get(row["id"], [])],
        )

    return [build(row) for row in by_parent.get(None, [])]


def _to_exercise(item: dict[str, Any], exercises: dict[int, dict[str, Any]]) -> PlanExercise:
    exercise = exercises.get(field(item, "exerciseId", "exercise_id"), {})
    return PlanExercise(
        name=exercise.get("name", "Ćwiczenie"),
        category=field(exercise, "garminCategory", "garmin_category"),
        tracking=field(exercise, "trackingType", "tracking_type", default="REPS"),
        sets=field(item, "targetSets", "target_sets", default=1),
        reps=field(item, "targetReps", "target_reps"),
        weight_kg=field(item, "targetWeight", "target_weight"),
        duration_seconds=field(item, "targetDurationSeconds", "target_duration_seconds"),
        rest_seconds=field(item, "restDurationSeconds", "rest_duration_seconds", default=0) or 0,
    )


@dataclass
class Segment:
    """Odcinek planu wytrzymałościowego. Grupa powtórzeń trzyma swoje wnętrze w `children`."""

    kind: str
    repeat_count: int | None
    duration_type: str
    distance_meters: float | None
    duration_seconds: int | None
    target_type: str
    target_low: float | None
    target_high: float | None
    children: list["Segment"]


SPORT_RUNNING = {"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1}
SPORT_CYCLING = {"sportTypeId": 2, "sportTypeKey": "cycling", "displayOrder": 2}
SPORT_SWIMMING = {"sportTypeId": 4, "sportTypeKey": "swimming", "displayOrder": 5}

ENDURANCE_SPORTS = {
    "RUNNING": (SPORT_RUNNING, RunningWorkout),
    "CYCLING": (SPORT_CYCLING, CyclingWorkout),
    "SWIMMING": (SPORT_SWIMMING, SwimmingWorkout),
}

NO_TARGET = {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1}
PACE_TARGET = {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone", "displayOrder": 6}
HR_TARGET = {"workoutTargetTypeId": 4, "workoutTargetTypeKey": "heart.rate.zone", "displayOrder": 4}


def target_fields(segment: Segment) -> dict[str, Any]:
    """
    Cel odcinka w zapisie Garmina. Tempo podajemy mu jako prędkość w metrach na sekundę,
    a nie jako sekundy na kilometr — pomylenie tych dwóch daje trening bez sensu, bo zakres
    wychodzi wtedy setki razy za duży.
    """
    if segment.target_type == "PACE" and segment.target_low and segment.target_high:
        return {
            "targetType": dict(PACE_TARGET),
            # Wyższa liczba sekund to wolniejszy bieg, więc dolna granica prędkości bierze się
            # z górnej granicy tempa.
            "targetValueOne": round(1000 / segment.target_high, 4),
            "targetValueTwo": round(1000 / segment.target_low, 4),
        }
    if segment.target_type == "HEART_RATE" and segment.target_low and segment.target_high:
        return {
            "targetType": dict(HR_TARGET),
            "targetValueOne": segment.target_low,
            "targetValueTwo": segment.target_high,
        }
    return {"targetType": dict(NO_TARGET)}


STEP_TYPES = {
    "WARMUP": {"stepTypeId": 1, "stepTypeKey": "warmup", "displayOrder": 1},
    "COOLDOWN": {"stepTypeId": 2, "stepTypeKey": "cooldown", "displayOrder": 2},
    "WORK": {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3},
    "RECOVERY": {"stepTypeId": 4, "stepTypeKey": "recovery", "displayOrder": 4},
}

END_DISTANCE = {"conditionTypeId": 3, "conditionTypeKey": "distance", "displayOrder": 3, "displayable": True}
END_TIME = {"conditionTypeId": 2, "conditionTypeKey": "time", "displayOrder": 2, "displayable": True}
END_OPEN = {"conditionTypeId": 1, "conditionTypeKey": "lap.button", "displayOrder": 1, "displayable": True}


def endurance_step(segment: Segment, step_order: int) -> ExecutableStep:
    """Pojedynczy odcinek jako krok treningu. Odcinek otwarty kończy przycisk na zegarku."""
    if segment.duration_type == "DISTANCE" and segment.distance_meters:
        end, value = END_DISTANCE, float(segment.distance_meters)
    elif segment.duration_type == "TIME" and segment.duration_seconds:
        end, value = END_TIME, float(segment.duration_seconds)
    else:
        end, value = END_OPEN, 0.0

    return ExecutableStep(
        stepOrder=step_order,
        stepType=dict(STEP_TYPES.get(segment.kind, STEP_TYPES["WORK"])),
        endCondition=dict(end),
        endConditionValue=value,
        **target_fields(segment),
    )


def build_endurance_workout(plan: Plan) -> Any:
    sport_type, workout_class = ENDURANCE_SPORTS[plan.sport]
    steps: list[Any] = []
    order = 1
    for segment in plan.segments:
        if segment.kind == "REPEAT":
            inside = []
            group_order = order
            order += 1
            for child in segment.children:
                inside.append(endurance_step(child, order))
                order += 1
            steps.append(create_repeat_group(max(segment.repeat_count or 1, 1), inside, group_order))
        else:
            steps.append(endurance_step(segment, order))
            order += 1

    return workout_class(
        workoutName=plan.title[:80],
        estimatedDurationInSecs=0,
        workoutSegments=[
            WorkoutSegment(segmentOrder=1, sportType=dict(sport_type), workoutSteps=steps)
        ],
    )


def format_pace(seconds_per_km: float) -> str:
    minutes, seconds = divmod(int(round(seconds_per_km)), 60)
    return f"{minutes}:{seconds:02d}/km"


def describe_segment(segment: Segment) -> str:
    if segment.duration_type == "DISTANCE" and segment.distance_meters:
        what = f"{int(segment.distance_meters)} m"
    elif segment.duration_type == "TIME" and segment.duration_seconds:
        what = f"{segment.duration_seconds} s"
    else:
        what = "do decyzji"

    if segment.target_type == "PACE" and segment.target_low and segment.target_high:
        target = f", tempo {format_pace(segment.target_low)}–{format_pace(segment.target_high)}"
    elif segment.target_type == "HEART_RATE" and segment.target_low and segment.target_high:
        target = f", tętno {int(segment.target_low)}–{int(segment.target_high)}"
    else:
        target = ""

    return f"{SEGMENT_LABELS.get(segment.kind, segment.kind)}: {what}{target}"


SEGMENT_LABELS = {
    "WARMUP": "Rozgrzewka",
    "WORK": "Praca",
    "RECOVERY": "Przerwa",
    "COOLDOWN": "Schłodzenie",
    "REPEAT": "Powtórzenia",
}

SPORT_LABELS = {
    "STRENGTH": "siła",
    "RUNNING": "bieganie",
    "CYCLING": "rower",
    "SWIMMING": "pływanie",
}


def describe_endurance(plan: Plan) -> str:
    count = len(plan.segments)
    lines = [
        f"{plan.title}  [{SPORT_LABELS.get(plan.sport, plan.sport)}, "
        f"{count} {plural(count, 'odcinek', 'odcinki', 'odcinków')}]"
    ]
    for segment in plan.segments:
        if segment.kind == "REPEAT":
            lines.append(f"   - ×{segment.repeat_count or 1}:")
            for child in segment.children:
                lines.append(f"        {describe_segment(child)}")
        else:
            lines.append(f"   - {describe_segment(segment)}")
    if plan.scheduled_dates:
        lines.append(f"   terminy: {', '.join(plan.scheduled_dates)}")
    return "\n".join(lines)


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


def build_workout(plan: Plan) -> Any:
    """Trening w zapisie Garmina. Siła ma serie i ciężar, reszta — odcinki dystansu i czasu."""
    if plan.sport in ENDURANCE_SPORTS:
        return build_endurance_workout(plan)

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


def describe_saved_step(step: dict[str, Any]) -> str:
    """Krok odczytany z Garmina. Odpowiedź serwera mówi, co zapisał, a nie co wysłaliśmy."""
    kind = (step.get("stepType") or {}).get("stepTypeKey", "?")
    end = (step.get("endCondition") or {}).get("conditionTypeKey", "?")
    value = step.get("endConditionValue") or 0
    if end == "distance":
        what = f"{int(value)} m"
    elif end == "time":
        what = f"{int(value)} s"
    elif end == "reps":
        what = f"{int(value)} powt."
    else:
        what = end

    extras = []
    category = step.get("category")
    if category:
        extras.append(str(category))
    weight = step.get("weightValue")
    if weight:
        extras.append(f"{weight / 1000:g} kg")
    target = (step.get("targetType") or {}).get("workoutTargetTypeKey")
    if target and target != "no.target":
        one, two = step.get("targetValueOne"), step.get("targetValueTwo")
        if target == "pace.zone" and one and two:
            # Garmin oddaje prędkość w metrach na sekundę — wracamy do tempa.
            extras.append(f"tempo {format_pace(1000 / two)}–{format_pace(1000 / one)}")
        elif one and two:
            extras.append(f"{target} {int(one)}–{int(two)}")
        else:
            extras.append(str(target))

    return f"{kind} {what}" + (", " + ", ".join(extras) if extras else "")


def plural(count: int, one: str, few: str, many: str) -> str:
    """Polska odmiana: 1 ćwiczenie, 2 ćwiczenia, 5 ćwiczeń."""
    last_two, last = count % 100, count % 10
    if count == 1:
        return one
    if 2 <= last <= 4 and not 12 <= last_two <= 14:
        return few
    return many


def describe(plan: Plan) -> str:
    if plan.sport in ENDURANCE_SPORTS:
        return describe_endurance(plan)

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
    path = Path(tokenstore).expanduser()
    api = Garmin()
    try:
        needs_mfa, _ = api.login(str(path))
    except Exception as exc:  # noqa: BLE001 — chcemy czytelnej podpowiedzi zamiast śladu stosu
        if "password" in str(exc).lower():
            sys.exit(
                "\n".join(
                    [
                        f"Nie znalazłem działających tokenów w: {path}",
                        "Wskaż właściwy katalog przez --tokenstore albo zmienną GARMIN_TOKEN_STORE.",
                        "Jeśli tokenów nie masz, zaloguj się raz skryptem, który je zapisuje.",
                    ]
                )
            )
        sys.exit(f"Logowanie nie powiodło się: {exc}")
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


def find_existing(api: Garmin, title: str) -> list[int]:
    """
    Identyfikatory treningów o tej samej nazwie, od najnowszego. Kolejność ma znaczenie:
    nadpisujemy najnowszy, bo to jego zwykle dotyczą wpisy w kalendarzu i kopia na zegarku.
    """
    matches = [
        int(item["workoutId"])
        for item in api.get_workouts(0, 100)
        if (item.get("workoutName") or "").strip().lower() == title.strip().lower()
    ]
    return sorted(matches, reverse=True)


def send_plan(api: Garmin, plan: Plan, as_new: bool) -> int:
    """
    Wysyła plan i zwraca workoutId. Trening o tej samej nazwie domyślnie nadpisujemy w miejscu,
    a nie dokładamy obok: zachowany identyfikator nie unieważnia wpisów w kalendarzu Garmina,
    a biblioteka nie zarasta kopiami przy każdym kolejnym wysłaniu.
    """
    payload = build_workout(plan).to_dict()
    existing = [] if as_new else find_existing(api, plan.title)

    if not existing:
        workout_id = int(api.upload_workout(payload)["workoutId"])
        print(f"Wysłano: {plan.title} → workoutId {workout_id}")
        return workout_id

    workout_id = existing[0]
    api.update_workout(workout_id, payload)
    print(f"Nadpisano: {plan.title} → workoutId {workout_id}")
    if len(existing) > 1:
        extra = ", ".join(str(other) for other in existing[1:])
        print(f"   uwaga: w bibliotece są jeszcze kopie o tej nazwie: {extra}")
        print("   usuniesz je poleceniem: delete --id <workoutId>")
    return workout_id


def cmd_delete(args: argparse.Namespace) -> None:
    api = connect(args.tokenstore)
    for workout_id in args.id:
        saved = api.get_workout_by_id(workout_id)
        name = saved.get("workoutName", "?")
        api.delete_workout(workout_id)
        print(f"Usunięto: {name} ({workout_id})")


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

    missing = [e.name for plan in plans if plan.sport == "STRENGTH" for e in plan.exercises if not e.category]
    if missing:
        print(f"Uwaga: bez kategorii Garmin ({len(missing)}): {', '.join(sorted(set(missing)))}")
        print("Takie ćwiczenia trafią na zegarek jako nieokreślone.\n")

    if not args.send:
        print("To był podgląd. Dodaj --send, aby wysłać do Garmin Connect.")
        return

    api = connect(args.tokenstore)
    for plan in plans:
        workout_id = send_plan(api, plan, args.new)

        if args.schedule:
            for date_str in plan.scheduled_dates:
                api.schedule_workout(workout_id, date_str)
                print(f"   zaplanowano na {date_str}")
        if args.push:
            api.push_workout_to_device(workout_id)
            print("   wypchnięto na zegarek")

        # Odpowiedź 201 mówi tylko, że serwer przyjął dane — sprawdzamy, co faktycznie zapisał.
        saved = api.get_workout_by_id(workout_id)
        groups = (saved.get("workoutSegments") or [{}])[0].get("workoutSteps", [])
        inner = sum(len(g.get("workoutSteps", []) or []) for g in groups)
        print(f"   weryfikacja: kroków {len(groups)}, w tym w grupach {inner}")
        for step in groups:
            if step.get("numberOfIterations"):
                inner_steps = step.get("workoutSteps") or []
                print(f"      ×{step.get('numberOfIterations')}:")
                for inner in inner_steps:
                    print(f"         {describe_saved_step(inner)}")
            else:
                print(f"      {describe_saved_step(step)}")


def main() -> None:
    # Konsola Windows domyślnie nie używa UTF-8, przez co polskie znaki się sypią.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tokenstore", default=DEFAULT_TOKENSTORE, help="katalog z tokenami Garmin")
    sub = parser.add_subparsers(dest="command", required=True)

    def with_tokenstore(cmd: argparse.ArgumentParser) -> argparse.ArgumentParser:
        """Ta sama opcja działa przed i po nazwie polecenia — kolejność łatwo pomylić."""
        cmd.add_argument("--tokenstore", dest="tokenstore_override", default=None)
        return cmd

    inspect_cmd = with_tokenstore(sub.add_parser("inspect", help="podejrzyj treningi na koncie Garmin"))
    inspect_cmd.add_argument("--limit", type=int, default=20)
    inspect_cmd.add_argument("--id", help="pokaż pełną strukturę jednego treningu")
    inspect_cmd.add_argument("--out", help="zapisz strukturę do pliku")
    inspect_cmd.add_argument("--chars", type=int, default=4000, help="ile znaków wypisać")
    inspect_cmd.set_defaults(func=cmd_inspect)

    upload_cmd = with_tokenstore(sub.add_parser("upload", help="wyślij plany z kopii zapasowej"))
    upload_cmd.add_argument("--backup", required=True, help="plik kopii zapasowej z aplikacji")
    upload_cmd.add_argument("--plan", action="append", help="nazwa planu (można podać wielokrotnie)")
    upload_cmd.add_argument("--send", action="store_true", help="faktycznie wyślij (domyślnie tylko podgląd)")
    upload_cmd.add_argument("--schedule", action="store_true", help="wpisz też terminy do kalendarza Garmin")
    upload_cmd.add_argument("--push", action="store_true", help="wypchnij trening na zegarek od razu")
    upload_cmd.add_argument(
        "--new",
        action="store_true",
        help="utwórz nowy trening zamiast nadpisać istniejący o tej samej nazwie",
    )
    upload_cmd.set_defaults(func=cmd_upload)

    delete_cmd = with_tokenstore(sub.add_parser("delete", help="usuń trening z biblioteki Garmin"))
    delete_cmd.add_argument("--id", action="append", required=True, help="workoutId (można podać wielokrotnie)")
    delete_cmd.set_defaults(func=cmd_delete)

    args = parser.parse_args()
    if getattr(args, "tokenstore_override", None):
        args.tokenstore = args.tokenstore_override
    args.func(args)


if __name__ == "__main__":
    main()
