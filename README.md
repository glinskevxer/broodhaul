# broodhaul

The pollination desk for a migratory beekeeping operation. It keeps the yards,
the colonies and the pallets they stand on; the contracts the bees are rented
under and the drops they go to; the grading that decides what those contracts
pay; the hauls, the mite programme and the honey that comes off afterwards.

It is a command line tool and a library. There is no server and no database.
Records are one json file each in a directory, because the office is two people
and a laptop in a shop, and being able to open a record in a text editor when
the software is wrong is worth more than anything a database would buy.

## Getting started

```
npm install
npx broodhaul --root ./records --actor "M Ojeda" example load
npx broodhaul --root ./records season 2025
```

`example load` writes a complete worked season: two yards, twelve colonies, a
contract for twenty four acres of almonds, a drop that came up four hives
short, and a grading run that landed under the contract minimum. Every command
below has something to talk about once it has been run.

## What the desk actually decides

Three things in here are worth reading the code for, because they are the parts
that are hard rather than long.

**The grading method comes out of the weather, not out of a menu.** A frame
count needs the field bees flying: fifty five degrees, under fifteen miles an
hour of wind, between ten and four, and dry. Below that the grader counts the
cluster through the top bars instead, which reads differently and converts
through a table. The method then decides how many hives have to be opened, because
a cluster count is coarser and the manual asks for half again as many of them.
Get the method wrong and every number downstream is wrong with it.

**A contract grades by average or by colony, and the two disagree.** Graded by
average, every run on the contract is pooled, one average comes out, one tier
is read off it and every delivered hive gets that adjustment. Graded by colony,
each opened hive is tiered on its own and the sample then stands in for the
whole delivery. On an even drop they agree. On an uneven one they do not, and
the same bees can be worth several thousand dollars more or less depending on
which clause was signed.

**A shortfall is settled three different ways.** Prorate scales the rate by how
close the average came. Reject pays only for the share of the sample that made
the minimum and the grower keeps the rest until they are swapped. Tier says the
tier table already dealt with it. On the worked season those three clauses pay
$59,377.50, $33,840.00 and $67,860.00 for one delivery.

## Commands

| command    | what it does                                     |
| ---------- | ------------------------------------------------ |
| `yard`     | yards, landowner agreements, occupancy           |
| `colony`   | colonies, queens, status changes                 |
| `pallet`   | pallets and the positions on them                |
| `block`    | orchard blocks, and the hives per acre they want |
| `contract` | pollination contracts and the drop plan for one  |
| `drop`     | set points, what was ordered and what was set    |
| `load`     | truck loads, weights and interstate paperwork    |
| `grading`  | grading runs, and what they do to the money      |
| `health`   | mite washes, treatments, state inspections       |
| `honey`    | drums, extraction lots, the season crop          |
| `settle`   | invoices, statements, the season register        |
| `season`   | the season on one page                           |
| `check`    | every disagreement the desk can find             |
| `journal`  | the write log                                    |

Every command takes `--json` and writes machine readable output instead of
tables. `--today` runs the program as though it were another day, which is how
the tests work and how a report gets rerun for a date in the past.

## Running the checks

```
npm test          # the whole suite
npm run coverage  # with thresholds
npm run lint
npm run format:check
```

## Layout

```
src/core/        money, dates, spans, identifiers, tables, serialisation
src/apiary/      yards, colonies, pallets, the register, forage geometry
src/grading/     conditions, sampling, frame counts, grading runs
src/contracts/   contracts, terms, assessment, shortfall rules
src/placement/   blocks, density, drops, drop plans
src/movement/    loads, weights, certificates and permits
src/health/      mite washes, thresholds, products, treatments, inspections
src/feeding/     syrup
src/honey/       drums, lots, the crop
src/settlement/  invoices and statements
src/store/       files, the record store, the journal
src/reporting/   the season report
src/cli/         the command line
tests/           mirrors src/, one file per module
```
