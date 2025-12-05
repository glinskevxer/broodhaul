# Running the desk

What the office actually does with this, in the order it does it. Everything
below assumes `--root` is set, or `BROODHAUL_ROOT` is, and that `--actor` is
whoever is at the keyboard.

## Every morning

```
broodhaul check
broodhaul journal tail --limit 10
```

`check` exits non zero when it finds anything, so it sits in the scheduled task
and only sends mail when there is something to read. The journal tail is for
the mornings when somebody else was in the records last night.

## Before a season

1. `broodhaul contract add ...` for each signed contract. The blocks go in as
   `block:acres:perAcre` triples and the tier table as `frames:cents` pairs.
2. `broodhaul contract plan CT-...` to see the drops in whole pallets.
3. `broodhaul forecast bloom --season 2026` to hold the colony count against
   what has been contracted. If that comes up short, the answer is either
   splits (`broodhaul forecast splits --target ...`) or selling a contract on,
   and it is a decision to make in September rather than in February.
4. `broodhaul registration calendar --year 2026` and file each state as it
   falls due.

## Delivery week

1. `broodhaul drop add ...` for each set point.
2. `broodhaul load add ...`, then `broodhaul load weigh LD-...` before it
   rolls. The weigh is the one that gets run in the dark with a phone on the
   mirror; it answers how many pallets have to come back off.
3. `broodhaul load permit LD-...` for anything crossing a state line.
4. `broodhaul load advance LD-... loaded --on ...` and again for `delivered`.
5. `broodhaul drop set DR-... --hives N --on ...`. This refuses a set outside
   the contract's delivery window, which is worth catching while the forklift
   is still there.

## Grading

```
broodhaul grading add --id GR-... --contract CT-... --drop DR-... \
  --grader "M Ojeda" --on 2026-02-14 --at 11:30 --temperature 63 \
  --readings CY-...:9,CY-...:7.5,CY-...:6
```

The method comes out of the weather, not out of a menu. If it says `cluster`
when the grader expected `frame`, the thermometer is the thing to argue with.

`broodhaul grading sample GR-... --population N` checks the run opened as many
hives as the terms ask for. Run it before the grower does.

## Settlement

```
broodhaul grading assess CT-... --delivered N
broodhaul settle invoice CT-...
broodhaul settle statement "Wilkins Farming" --season 2026
broodhaul settle register --season 2026
```

The invoice bills rent in full and takes the grading off underneath, one line
for the tier and one for the shortfall clause. Send the grower the printed
invoice rather than the total; the working is what ends the conversation.

## When a grower will not pay

```
broodhaul dispute raise CT-... --id DS-... --grounds grading --amount 250000 --on ...
broodhaul dispute open
```

The answer window is five days on a grading dispute and three weeks on a damage
claim. `dispute open` leads with what is overdue.

## The mite programme

```
broodhaul health wash --colony CY-... --yard YD-... --on ... --mites 9
broodhaul health treat --id TR-... --yard YD-... --product apivar --on ... \
  --colonies CY-...,CY-... --temperature 88 --applicator "M Ojeda"
broodhaul health treatments --overdue
broodhaul register health
```

`health treat` refuses an application that breaks the label, uses up a season
cap or repeats a chemical class. All three are legal problems rather than
preferences.

## Backups

```
broodhaul store snapshot ./snapshots/2026-02-01.json --note "before settlement"
broodhaul store diff ./snapshots/2026-02-01.json
broodhaul store restore ./snapshots/2026-02-01.json --confirm
```

`restore` is the only command that throws work away. Without `--confirm` it
prints what it would change and does nothing.

## When something looks wrong

```
broodhaul audit history colonies CY-2025-0011
broodhaul audit reworked
broodhaul selftest
```

`selftest` loads the worked season into a temporary directory and walks it end
to end. If it passes and the real records still look wrong, the problem is in
the records rather than in the program.
