# Divider tools

Browser utilities for EIS XML:

- **Divider** — split an `export.xml` (or ZIP) into separate `contractProcedure` files, one per `<executions>` block
- **Editor** — import XML, browse/edit a collapsible tree, download the result

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

### Home

Open the home page and choose **Divider** or **Editor**. Language (EN/RU) is shared across pages.

### Divider

1. Click **Choose XML / ZIP** and select an EIS export file:
   - `.xml` — root `ns3:export` with at least one `ns3:contract`
   - `.zip` — archive that contains such an XML (first matching file is used)
2. Review summary and the executions list.
3. Use **Select all** / row checkboxes; click a row to preview XML in a new tab.
4. Click **Export selected** — ZIP with only marked executions.

Each file in the ZIP looks like `{regNum}_exec_{ordinal}_{id}.xml`.

`contractProcedure` nodes with `<termination>` (and no `<executions>`) are skipped.

### Editor

1. Click **Import XML**.
2. Data is shown as a **Field / Value** table. Sections with data start expanded; empty ones stay collapsed.
3. Edit values in place. Use **Expand all** / **Collapse empty** as needed.
4. Click **Download XML** to save the edited file.

## Project layout

| Path | Purpose |
|------|---------|
| `index.html` / `home.js` | Front page with tool buttons |
| `divider.html` / `divider.js` | Split executions |
| `editor.html` / `editor.js` | Tree XML editor |
| `styles.css` | Shared styles |
| `vendor/jszip.min.js` | ZIP read/write (Divider) |
| `Dockerfile` | nginx image for static serving |
| `docker-compose.yml` | Run on port 8765 |
| `run-vds.sh` | Install Docker and start on Ubuntu 24.04 VDS |

## Notes

- Processing is local in the browser; files are not uploaded anywhere.
- Sample data and XSD schemes (`scheme_16_2_8_iter_1/`, `*.zip`) are gitignored.
