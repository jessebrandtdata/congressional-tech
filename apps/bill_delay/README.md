# Bill Delay Tracker data

Proposal [IV.2](../site/src/content/proposals/IV.2.md): the lag between a bill's printed text and its first CRS summary. This folder builds the data; the page is [`apps/site/src/pages/bill-delay.astro`](../site/src/pages/bill-delay.astro) with its island in [`apps/site/src/components/bill-delay/`](../site/src/components/bill-delay/).

Everything is read from the bill-family tables of Civic Tech DC's spicy-regs warehouse (Parquet on `data.spicygov.ai`, pointer `publication.v2.json`): no API key and no per-bill API calls. `collect_warehouse.py` needs `duckdb`, which the workspace environment already has (`congress-api[archive]`); the rest is stdlib.

## Run it

From this folder, with the workspace environment (`uv sync --frozen` at the repository root):

```bash
../../.venv/bin/python -m bill_delay.collect_warehouse --congress all   # every Congress the warehouse has, the 108th on
../../.venv/bin/python -m bill_delay.delays                             # lags, statistics and the Congress index
../../.venv/bin/python -m bill_delay.site_data                          # copy into ../site/public/data/bill-delay/
npm --prefix ../site run dev                                            # then open /congressional-tech/bill-delay/
```

The Pages workflow (`.github/workflows/deploy-pages.yml`) runs the same three steps before every build and once a day at 07:00 UTC, after the warehouse's nightly generation. Nothing it builds is committed: `data/` here and `public/data/bill-delay/` in the site are ignored.

| Module | Does |
| --- | --- |
| `congress.py` | The eight measure types, the Congress in session on a date (every Congress since the 74th begins January 3 of an odd year) and the `--congress` option (numbers, ranges like `113-119`, `current`, `previous`, `all`). Nothing names a Congress number, so the 120th starts by itself on 2027-01-03. |
| `collect_warehouse.py` | Reads the current generation into `data/<congress>/`: `versions.csv` (`bill_versions`, titled from `congress_bills`, sized in sections and characters from `bill_sections`; `pages` once the warehouse publishes a page count), `summaries.csv` (`bill_publisher_summaries`, the earliest retained revision as the publication date) and `warehouse.json` (the generation read). |
| `delays.py` | Per Congress: maps text versions and summaries onto four stages, measures each bill from the date printed on its introduced text to its first CRS summary at any stage, and writes `delays.csv`, `awaiting.csv`, `stats.json` and `delays.json` (one record per text version, what the page loads); then `data/congresses.json`, the index the page opens with. |
| `site_data.py` | Copies the index and each Congress's `delays.json`, `stats.json`, `delays.csv` and `awaiting.csv` into the site. |

Tests: `python -m unittest discover -s tests` here (offline; the collector test writes its own small Parquet stand-in for the warehouse), and `npm --prefix ../site run test:bill-delay` for the page's calculations and chart scales.

## Size: pages asked for, characters and sections shown (2026-11-09)

Proposal IV.2's first metric is "the total number of pages in the bills processed". The warehouse has no page count. GovInfo does, one API call per printing (the package summary's `pages`, or `<extent>9 p.</extent>` in the MODS record), and the Bill Delay Tracker prototype made those calls until 2026-11-09. This build reads only the warehouse and sizes bills by their parsed text in `bill_sections`: a section count and a character count per printing, covering about 99.8% of printings from the 110th Congress on, 69% of the 109th's and 11% of the 108th's. When the warehouse publishes a page count on `bill_versions`, `collect_warehouse.py` reads it into the `pages` column and the dashboard offers pages first, with no other change.

## Summary date: publication, not revision (2026-11-06)

Proposal IV.2 asks for "the time lag between bill text publication and Congress.gov summary availability". The summary end of that lag is the day the summary first became available, and the Congress.gov field for it (`lastSummaryUpdateDate`, the "Which dates" table below) is overwritten whenever CRS revises a summary, so a revised summary overstates its lag.

Civic Tech DC's spicy-regs warehouse (Parquet at `data.spicygov.ai`, pointer `publication.v2.json`, table `bill_publisher_summaries`) reads the same BILLSTATUS source nightly and, since its 2026-11-06 generation, keeps every dated revision of a summary as its own row instead of overwriting. The earliest retained `update_date` for a bill and summary version is therefore the summary's first publication on the publisher's own clock, which is the date the proposal asks for. The one case it cannot recover is a summary revised twice between two nightly runs, which loses its first stamp before capture; that is bounded to a day. Summaries first captured before 2026-11-06 carry only their latest revision. `collect_warehouse.py` writes the earliest retained revision as `last_summary_update_date`, the date `delays.py` measures to, and the latest as `update_date`.

The text start: the warehouse's `bill_versions.version_date` is the date printed on the bill, before the text is readable, and no source states the day the text appeared on Congress.gov. The warehouse's build receipts record when its reader first saw each printing (`observed_at`), but not on the table, and for printings older than the reader it is the backfill date (the 119th Congress's H.R. 1 as reported, printed 2025-05-20, reads 2026-09-26). Publishing `observed_at` on `bill_versions` would give a first-seen date for every printing from then on.

## Which dates

Proposal IV.2 asks for "the time lag between bill text publication and Congress.gov summary availability". No source publishes either event directly, so the tracker picks the nearest field at each end. The candidates, with each source's own definition:

**Start of the lag (when the text became public)**

| Field | Source | The docs say | Used? |
| --- | --- | --- | --- |
| `version_date` / `dateIssued` | the warehouse's `bill_versions`; GovInfo package summary and collection listing | The date on the document | **Yes** (`text_date`). Every Congress has it and it costs no API call. Equals the introduction date for almost every introduced bill; GovInfo posted 119th Congress introduced bills a median 12 days after it, 28 days at the 90th percentile (2026-10-15 run), so lags read that much longer than a reader's wait. |
| `dateIngested` | GovInfo, per-version MODS record | "The date the document was ingested into the GovInfo preservation repository" ([Bills help page](https://www.govinfo.gov/help/bills), search field `ingestdate`) | Used until 2026-11-09, now no. The closest observable to the text going public, but one API call per printing, and for bills printed before GovInfo's predecessor was migrated it is the migration (a 110th Congress introduced bill reads 2010-09-21). |
| `observed_at` | the warehouse's build receipts | when the warehouse's reader first saw the printing | No. Not on the table, and a backfill date for printings older than the reader. |
| `lastModified` | GovInfo, package summary and `lastModifiedStartDate` filter | "the time that this package was added or updated ... not the equivalent to Date Published, Date Issued, or Date Ingested in MODS" ([usgpo/api README](https://github.com/usgpo/api#lastmodifiedstartdatelastmodifiedenddate-usage)) | No. A bulk reprocess in July 2026 reset it for most of the Congress. |
| `textVersions[].date` | Congress.gov API, bill item | "associated with the date of action, not the printing date" ([BillEndpoint.md](https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/BillEndpoint.md)) | No. Same information as the printed date, and null for some versions (the enrolled hr1, for one). |
| `updateDateIncludingText` | Congress.gov API, bill level | "The date of update on Congress.gov, including if the update was to bill text" | No. One value per bill, overwritten by every later text and metadata update, so it cannot date an individual version. |

**End of the lag (when the summary became available)**

| Field | Source | The docs say | Used? |
| --- | --- | --- | --- |
| earliest retained `update_date` | the warehouse's `bill_publisher_summaries` | one row per dated revision since 2026-11-06 | **Yes** (`summary_date`). The first publication, for summaries captured since 2026-11-06; the latest revision for older ones. |
| `lastSummaryUpdateDate` | Congress.gov API, summaries | "The date the bill summary was last updated. This date also reflects the date and time when a bill summary is re-published." ([SummariesEndpoint.md](https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/SummariesEndpoint.md)) | Used before the warehouse; overwritten when CRS revises a summary. |
| `updateDate` | Congress.gov API, summaries | "The date of update on Congress.gov" | No. Moves on any re-save of the record, summary text or not. |
| `actionDate` | Congress.gov API, summaries | "The date of the action associated with the bill summary" | No. It dates the bill action the summary describes (introduction, passage), not the summary; as an end date it would make most introduced lags zero. |

The remaining doubt at both ends comes from reading history off fields that are dated by the publisher or overwritten. A daily record of the first day each printing and each summary is seen removes it; the warehouse's `observed_at` is that record for printings, once it is published.

