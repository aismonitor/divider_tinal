# Divider

Browser utility that splits an EIS `export.xml` (or a ZIP containing it) into separate XML files — one `contractProcedure` per `<executions>` block.

## Requirements

- Modern browser (Chrome, Firefox, Edge)
- No build step; files are served as static HTML/JS

## Run

From the project root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/)

Any other static server works the same way (for example `npx serve`).

> Prefer `http://` over opening `index.html` as a `file://` URL — some browsers restrict File APIs that way.

## Use

1. Click **Choose XML / ZIP** and select an EIS export file:
   - `.xml` — root `ns3:export` with at least one `ns3:contract`
   - `.zip` — archive that contains such an XML (first matching file is used)
2. Check the summary:
   - **Contract schemeVersion** — from `ns3:contract`
   - **Executions found** — count of `contractProcedure` nodes that contain `<executions>`
   - **Contract regNum** — registry number used in export file names
3. Review the list (ordinal, document name / payment doc, date, id).
4. Click **Export all executions** to download `executions_{regNum}.zip`.

Each file in the ZIP looks like:

```text
{regNum}_exec_{ordinal}_{id}.xml
```

and contains:

```xml
<ns3:export ...>
  <ns3:contractProcedure schemeVersion="...">
    ... original procedure including <executions> ...
  </ns3:contractProcedure>
</ns3:export>
```

`contractProcedure` nodes with `<termination>` (and no `<executions>`) are skipped.

## Project layout

| Path | Purpose |
|------|---------|
| `index.html` | UI |
| `app.js` | Parse / list / export |
| `styles.css` | Styles |
| `vendor/jszip.min.js` | ZIP read/write |

## Notes

- Processing is local in the browser; files are not uploaded anywhere.
- Sample data and XSD schemes (`scheme_16_2_8_iter_1/`, `*.zip`) are gitignored.
