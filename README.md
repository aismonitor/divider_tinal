# Divider

Browser utility that splits an EIS `export.xml` (or a ZIP containing it) into separate XML files — one `contractProcedure` per `<executions>` block.

## Requirements

- Modern browser (Chrome, Firefox, Edge)
- No build step; files are served as static HTML/JS

## Run

### Docker (recommended)

```bash
docker compose up --build
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/)

Or without Compose:

```bash
docker build -t divider .
docker run --rm -p 8765:80 divider
```

### Ubuntu 24.04 VDS

On a fresh VPS/VDS (Ubuntu 24.04), from the project directory:

```bash
chmod +x run-vds.sh
./run-vds.sh
```

The script installs Docker if needed, builds the image, and starts the app in the background on port **8765** (override with `PORT=8080 ./run-vds.sh`).

Other commands:

```bash
./run-vds.sh status   # container state
./run-vds.sh logs     # follow nginx logs
./run-vds.sh stop     # stop service
./run-vds.sh restart  # rebuild and restart
```

Open `http://<server-ip>:8765/` in a browser. Allow the port in the cloud firewall if the page does not load.

### Local static server

From the project root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/)

Any other static server works the same way (for example `npx serve`).

> Prefer `http://` over opening `index.html` as a `file://` URL — some browsers restrict File APIs that way.

## Use

1. Switch **Language** (English / Русский) in the header — the whole UI updates immediately. Choice is remembered in the browser.
2. Click **Choose XML / ZIP** and select an EIS export file:
   - `.xml` — root `ns3:export` with at least one `ns3:contract`
   - `.zip` — archive that contains such an XML (first matching file is used)
3. Review the results:
   - **Parsed** file name
   - customer `shortName` and `contractSubject`
   - **Found N executions**
4. Use **Select all** / row checkboxes to mark executions (`number`, `paidRUR`, name, date).
   Click a row (not the checkbox) to preview that execution’s XML in a new tab.
5. Click **Export selected** — a ZIP is created **only then**, and **only** for marked executions.

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
| `Dockerfile` | nginx image for static serving |
| `docker-compose.yml` | Run on port 8765 |
| `run-vds.sh` | Install Docker and start on Ubuntu 24.04 VDS |

## Notes

- Processing is local in the browser; files are not uploaded anywhere.
- Sample data and XSD schemes (`scheme_16_2_8_iter_1/`, `*.zip`) are gitignored.
