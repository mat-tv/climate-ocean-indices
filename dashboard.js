(function () {
    "use strict";

    const dashboard = document.getElementById("climate-dashboard");

    if (!dashboard) {
        return;
    }

    const content = dashboard.querySelector("[data-climate-content]");
    const sidebar = dashboard.querySelector("[data-climate-sidebar]");
    const menuButton = dashboard.querySelector("[data-climate-menu-button]");
    const backdrop = dashboard.querySelector("[data-climate-backdrop]");
    const navButtons = Array.from(
        dashboard.querySelectorAll("[data-climate-view]")
    );

    const dataBaseUrl = String(dashboard.dataset.dataBaseUrl || "")
        .replace(/\/+$/, "");
    const assetBaseUrl = String(
        dashboard.dataset.assetBaseUrl || dataBaseUrl
    ).replace(/\/+$/, "");
    const assetVersion = dashboard.dataset.assetVersion || "";
    const projectCreator = dashboard.dataset.projectCreator || "MTroncoso-Villar";
    const projectYear = dashboard.dataset.projectYear || "2026";
    const portalTitle = "Portal de Índices Climáticos y Oceanográficos";

    const indexViews = {
        roni: {
            rootId: "climate-roni",
            script: "roni.js",
            data: "roni.json",
            metadata: "roni.json",
            csv: "roni.csv",
            json: "roni.json"
        },
        pdo: {
            rootId: "climate-pdo",
            script: "pdo.js",
            data: "pdo.json",
            metadata: "pdo.json",
            csv: "pdo.csv",
            json: "pdo.json"
        },
        sam: {
            rootId: "climate-sam",
            script: "sam.js",
            data: "sam.json",
            metadata: "sam.json",
            csv: "sam.csv",
            json: "sam.json"
        },
        mjo: {
            rootId: "climate-mjo",
            script: "mjo.js",
            data: "mjo.json",
            metadata: "mjo.json",
            csv: "mjo.csv",
            json: "mjo.json"
        }
    };

    const compareSeries = {
        roni: {
            label: "RONI",
            valueKey: "roni",
            unit: "°C"
        },
        pdo: {
            label: "PDO",
            valueKey: "pdo",
            unit: "°C"
        },
        sam: {
            label: "SAM / AAO",
            valueKey: "sam",
            unit: "índice"
        },
        mjo: {
            label: "MJO / ROMI (amplitud)",
            valueKey: "amplitude",
            unit: "adimensional"
        }
    };

    const panes = new Map();
    const scriptPromises = new Map();
    const dataPromises = new Map();
    let activeView = "overview";

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function buildUrl(base, path) {
        const cleanPath = String(path).replace(/^\/+/, "");
        return `${base}/${cleanPath}`;
    }

    function assetUrl(filename) {
        const url = buildUrl(assetBaseUrl, `web/${filename}`);
        return assetVersion
            ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(assetVersion)}`
            : url;
    }

    function pngDownloadButton(filename) {
        return {
            name: "Descargar gráfico como PNG",
            icon: window.Plotly.Icons.camera,
            click: graph => downloadCleanPng(graph, filename)
        };
    }

    async function downloadCleanPng(graph, filename) {
        const width = Math.round(
            graph._fullLayout?.width || graph.clientWidth || 900
        );
        const height = Math.round(
            graph._fullLayout?.height || graph.clientHeight || 500
        );
        const exportNode = document.createElement("div");
        const exportLayout = JSON.parse(JSON.stringify(graph.layout));

        exportNode.style.cssText =
            `position:fixed;left:-10000px;top:0;width:${width}px;` +
            `height:${height}px;background:#fff;`;
        document.body.appendChild(exportNode);

        exportLayout.width = width;
        exportLayout.height = height;
        exportLayout.autosize = false;
        exportLayout.paper_bgcolor = "#fff";
        exportLayout.plot_bgcolor = "#fff";

        if (exportLayout.xaxis?.rangeselector) {
            exportLayout.xaxis.rangeselector.visible = false;
        }

        try {
            await window.Plotly.newPlot(exportNode, graph.data, exportLayout, {
                staticPlot: true,
                displayModeBar: false
            });
            await window.Plotly.downloadImage(exportNode, {
                format: "png",
                filename,
                width,
                height,
                scale: 1
            });
        } finally {
            window.Plotly.purge(exportNode);
            exportNode.remove();
        }
    }

    function setMenu(open) {
        dashboard.classList.toggle("is-menu-open", open);
        menuButton.setAttribute("aria-expanded", String(open));
        sidebar.setAttribute("aria-hidden", String(!open && isMobile()));
    }

    function isMobile() {
        return window.matchMedia("(max-width: 900px)").matches;
    }

    function closeMenu() {
        setMenu(false);
    }

    function syncSidebarAccessibility() {
        sidebar.setAttribute(
            "aria-hidden",
            String(isMobile() && !dashboard.classList.contains("is-menu-open"))
        );
    }

    function setActiveButton(view) {
        navButtons.forEach(button => {
            const selected = button.dataset.climateView === view;
            button.classList.toggle("is-active", selected);

            if (selected) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
        });
    }

    function createPane(view) {
        const pane = document.createElement("section");
        pane.className = "climate-dashboard-pane";
        pane.dataset.pane = view;
        pane.hidden = true;
        content.appendChild(pane);
        panes.set(view, pane);
        return pane;
    }

    function showPane(view) {
        panes.forEach((pane, key) => {
            pane.hidden = key !== view;
        });

        const pane = panes.get(view);

        if (pane && window.Plotly) {
            pane.querySelectorAll(".js-plotly-plot").forEach(chart => {
                window.Plotly.Plots.resize(chart);
            });
        }
    }

    function loadingMarkup(label) {
        return `
            <div class="climate-dashboard-status" role="status">
                <span class="climate-dashboard-loader" aria-hidden="true"></span>
                Cargando ${label}…
            </div>
        `;
    }

    function errorMarkup(message) {
        return `
            <div class="climate-dashboard-message" role="alert">
                <strong>No fue posible abrir esta vista.</strong>
                <p>${message}</p>
            </div>
        `;
    }

    function loadScript(filename) {
        if (scriptPromises.has(filename)) {
            return scriptPromises.get(filename);
        }

        const promise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = assetUrl(filename);
            script.async = true;
            script.onload = resolve;
            script.onerror = function () {
                script.remove();
                scriptPromises.delete(filename);
                reject(new Error(`No se pudo cargar ${filename}`));
            };
            document.head.appendChild(script);
        });

        scriptPromises.set(filename, promise);
        return promise;
    }

    function overviewMarkup() {
        return `
            <div class="climate-dashboard-overview">
                <div class="climate-index-kicker">SISTEMA CLIMÁTICO</div>
                <h1 class="climate-view-title" tabindex="-1">
                    Índices climáticos y oceanográficos
                </h1>
                <p class="climate-dashboard-intro">
                    Explore series oficiales, su metodología y los productos
                    descargables. Los datos se cargan únicamente al abrir cada
                    índice.
                </p>

                <div class="climate-overview-grid">
                    <button type="button" class="climate-overview-card" data-open-view="roni">
                        <span class="climate-overview-family">ENSO</span>
                        <strong>RONI</strong>
                        <span>Relative Oceanic Niño Index</span>
                    </button>

                    <button type="button" class="climate-overview-card" data-open-view="pdo">
                        <span class="climate-overview-family">Pacífico</span>
                        <strong>PDO</strong>
                        <span>Pacific Decadal Oscillation</span>
                    </button>

                    <button type="button" class="climate-overview-card" data-open-view="sam">
                        <span class="climate-overview-family">Hemisferio Sur</span>
                        <strong>SAM / AAO</strong>
                        <span>Southern Annular Mode</span>
                    </button>

                    <button type="button" class="climate-overview-card" data-open-view="mjo">
                        <span class="climate-overview-family">Intraestacional</span>
                        <strong>MJO / ROMI</strong>
                        <span>Madden–Julian Oscillation</span>
                    </button>
                </div>

                <div class="climate-dashboard-note">
                    <strong>Acerca de esta versión.</strong>
                    La interfaz separa la visualización del procesamiento
                    científico. Las fuentes, unidades y frecuencias originales
                    se conservan en los metadatos de cada producto.
                </div>

                <div class="climate-dashboard-credits">
                    <p>
                        <strong>Créditos del proyecto.</strong>
                        Concepto, dirección y desarrollo del portal:
                        ${escapeHtml(projectCreator)}.
                    </p>
                    <p>
                        Se agradece al Departamento de Ingeniería Hidráulica y
                        Ambiental (DIHA) de la Pontificia Universidad Católica de Chile
                        por su disposición a apoyar y alojar esta iniciativa.
                    </p>
                    <p class="climate-dashboard-copyright">
                        © ${escapeHtml(projectYear)} ${escapeHtml(projectCreator)} ·
                        Interfaz, integración y visualizaciones del portal.
                        Los datos científicos conservan la autoría y las condiciones
                        de uso de las fuentes institucionales indicadas en cada índice.
                    </p>
                </div>
            </div>
        `;
    }

    function ensureOverview() {
        if (panes.has("overview")) {
            return panes.get("overview");
        }

        const pane = createPane("overview");
        pane.innerHTML = overviewMarkup();
        return pane;
    }

    function prepareDownloads(indexRoot) {
        const links = Array.from(
            indexRoot.querySelectorAll(".climate-index-downloads a")
        );
        const csvLink = links.find(link =>
            new URL(link.href, window.location.href).pathname.endsWith(".csv")
        );

        if (csvLink && !csvLink.dataset.climateDownloadFormat) {
            csvLink.textContent = "Descargar CSV";
            csvLink.title =
                "Incluye al comienzo la procedencia y el crédito del portal";
            csvLink.dataset.climateDownloadFormat = "csv";
            csvLink.removeAttribute("target");
            csvLink.removeAttribute("rel");
        }
    }

    async function downloadDocumentedCsv(link) {
        const previousText = link.textContent;
        link.textContent = "Preparando…";
        link.setAttribute("aria-busy", "true");

        try {
            const response = await fetch(link.href);

            if (!response.ok) {
                throw new Error("No se pudo preparar la descarga documentada");
            }

            const originalCsv = (await response.text()).replace(/^\uFEFF/, "");
            const portalUrl = `${window.location.origin}${window.location.pathname}`;
            const sourceName = new URL(link.href).pathname.split("/").pop();
            const reference = [
                `# Descargado desde: ${portalUrl}`,
                `# ${portalTitle} — © ${projectYear} ${projectCreator}`
            ].join("\r\n");
            const documentedCsv = `${reference}\r\n${originalCsv}`;
            const blob = new Blob([documentedCsv], {
                type: "text/csv;charset=utf-8"
            });
            const objectUrl = URL.createObjectURL(blob);
            const download = document.createElement("a");

            download.href = objectUrl;
            download.download = sourceName;
            document.body.appendChild(download);
            download.click();
            download.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch (error) {
            console.error(error);
            link.textContent = "No se pudo descargar";
            window.setTimeout(() => {
                link.textContent = previousText;
            }, 2500);
        } finally {
            link.removeAttribute("aria-busy");
            if (link.textContent === "Preparando…") {
                link.textContent = previousText;
            }
        }
    }

    async function ensureIndexView(view) {
        if (panes.has(view)) {
            return panes.get(view);
        }

        const config = indexViews[view];
        const pane = createPane(view);
        pane.innerHTML = loadingMarkup(config.rootId.replace("climate-", "").toUpperCase());
        pane.setAttribute("aria-busy", "true");

        const indexRoot = document.createElement("div");
        indexRoot.id = config.rootId;
        indexRoot.className = "climate-index";
        indexRoot.dataset.dataUrl = buildUrl(dataBaseUrl, `data/${config.data}`);
        indexRoot.dataset.metadataUrl = buildUrl(
            dataBaseUrl,
            `metadata/${config.metadata}`
        );
        indexRoot.dataset.csvUrl = buildUrl(dataBaseUrl, `data/${config.csv}`);
        indexRoot.dataset.jsonUrl = buildUrl(dataBaseUrl, `data/${config.json}`);

        try {
            pane.replaceChildren(indexRoot);
            await loadScript(config.script);
            prepareDownloads(indexRoot);
            pane.removeAttribute("aria-busy");
        } catch (error) {
            console.error(error);
            pane.removeAttribute("aria-busy");
            pane.innerHTML = errorMarkup(
                "Revise la publicación de los archivos del frontend y vuelva a intentarlo."
            );
        }

        return pane;
    }

    function compareMarkup() {
        return `
            <div class="climate-compare">
                <div class="climate-index-kicker">ANÁLISIS EXPLORATORIO</div>
                <h1 class="climate-view-title" tabindex="-1">Comparar índices</h1>
                <p class="climate-dashboard-intro">
                    Superponga series con sus valores originales o estandarícelas
                    dentro del intervalo seleccionado para facilitar la comparación visual.
                </p>

                <form class="climate-compare-controls" data-compare-form>
                    <fieldset>
                        <legend>Series</legend>
                        <label><input type="checkbox" name="series" value="roni" checked> RONI</label>
                        <label><input type="checkbox" name="series" value="pdo"> PDO</label>
                        <label><input type="checkbox" name="series" value="sam" checked> SAM / AAO</label>
                        <label><input type="checkbox" name="series" value="mjo"> MJO / ROMI — amplitud</label>
                    </fieldset>

                    <label class="climate-compare-field">
                        <span>Representación</span>
                        <select name="mode">
                            <option value="standardized" selected>Estandarizada</option>
                            <option value="original">Valores originales</option>
                        </select>
                    </label>

                    <label class="climate-compare-field">
                        <span>Intervalo</span>
                        <select name="period">
                            <option value="5">5 años</option>
                            <option value="20" selected>20 años</option>
                            <option value="50">50 años</option>
                            <option value="all">Todo</option>
                        </select>
                    </label>

                    <button type="submit" class="climate-compare-submit">
                        Actualizar gráfico
                    </button>
                </form>

                <div class="climate-compare-method" data-compare-method></div>
                <div class="climate-compare-chart" data-compare-chart></div>
                <div class="climate-index-error" data-compare-error></div>
            </div>
        `;
    }

    function fetchSeries(id) {
        if (dataPromises.has(id)) {
            return dataPromises.get(id);
        }

        const config = indexViews[id];
        const promise = fetch(buildUrl(dataBaseUrl, `data/${config.data}`))
            .then(response => {
                if (!response.ok) {
                    throw new Error(`No se pudo cargar ${compareSeries[id].label}`);
                }
                return response.json();
            })
            .catch(error => {
                dataPromises.delete(id);
                throw error;
            });

        dataPromises.set(id, promise);
        return promise;
    }

    function standardize(values) {
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce(
            (sum, value) => sum + Math.pow(value - mean, 2),
            0
        ) / values.length;
        const standardDeviation = Math.sqrt(variance);

        if (!standardDeviation) {
            return values.map(() => 0);
        }

        return values.map(value => (value - mean) / standardDeviation);
    }

    function periodStart(recordsBySeries, years) {
        if (years === "all") {
            return null;
        }

        const latestTimestamp = Math.max(
            ...recordsBySeries.flatMap(records =>
                records.length
                    ? [Date.parse(`${records[records.length - 1].date}T00:00:00Z`)]
                    : []
            )
        );
        const start = new Date(latestTimestamp);
        start.setUTCFullYear(start.getUTCFullYear() - Number(years));
        return start.getTime();
    }

    async function renderComparison(pane) {
        const form = pane.querySelector("[data-compare-form]");
        const chart = pane.querySelector("[data-compare-chart]");
        const method = pane.querySelector("[data-compare-method]");
        const error = pane.querySelector("[data-compare-error]");
        const submitButton = form.querySelector("button[type='submit']");
        const selected = Array.from(
            form.querySelectorAll("input[name='series']:checked")
        ).map(input => input.value);

        error.textContent = "";

        if (!selected.length) {
            error.textContent = "Seleccione al menos una serie.";
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Cargando…";
        chart.setAttribute("aria-busy", "true");

        try {
            const datasets = await Promise.all(selected.map(fetchSeries));
            const mode = form.elements.mode.value;
            const period = form.elements.period.value;

            const cleaned = datasets.map((records, index) => {
                const series = compareSeries[selected[index]];
                return records
                    .filter(record => record[series.valueKey] !== null)
                    .map(record => ({
                        date: record.date,
                        value: Number(record[series.valueKey])
                    }))
                    .filter(record => Number.isFinite(record.value));
            });

            const start = periodStart(cleaned, period);
            const traces = cleaned.map((records, index) => {
                const id = selected[index];
                const series = compareSeries[id];
                const visible = start === null
                    ? records
                    : records.filter(record =>
                        Date.parse(`${record.date}T00:00:00Z`) >= start
                    );
                const originalValues = visible.map(record => record.value);
                const values = mode === "standardized"
                    ? standardize(originalValues)
                    : originalValues;

                return {
                    x: visible.map(record => record.date),
                    y: values,
                    customdata: originalValues,
                    type: "scatter",
                    mode: "lines",
                    name: series.label,
                    hovertemplate:
                        `<b>${series.label}</b><br>%{x|%Y-%m-%d}<br>` +
                        (mode === "standardized"
                            ? "z: %{y:.2f}<br>Original: %{customdata:.2f}"
                            : `Valor: %{y:.2f} ${series.unit}`) +
                        "<extra></extra>"
                };
            });

            const layout = {
                margin: {l: 60, r: 25, t: 25, b: 72},
                hovermode: "x unified",
                xaxis: {type: "date", showgrid: true, zeroline: false},
                yaxis: {
                    title: {
                        text: mode === "standardized"
                            ? "Valor estandarizado (z)"
                            : "Valor original (unidades propias)"
                    },
                    showgrid: true,
                    zeroline: true
                },
                legend: {orientation: "h", x: 0, y: 1.12},
                annotations: [{
                    text:
                        `© ${escapeHtml(projectYear)} ${escapeHtml(projectCreator)} · ` +
                        " Datos: fuentes indicadas",
                    xref: "paper",
                    yref: "paper",
                    x: 0,
                    y: 0,
                    xanchor: "left",
                    yanchor: "top",
                    yshift: -48,
                    showarrow: false,
                    font: {size: 9},
                    opacity: 0.62
                }],
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)"
            };

            const config = {
                responsive: true,
                displaylogo: false,
                scrollZoom: true,
                modeBarButtonsToRemove: ["toImage"],
                modeBarButtonsToAdd: [
                    pngDownloadButton("comparacion_indices_climaticos")
                ]
            };

            await window.Plotly.react(chart, traces, layout, config);

            method.innerHTML = mode === "standardized"
                ? "<strong>Estandarización.</strong> Para cada serie se calcula " +
                  "[z = (x − media) / desviación estándar] usando solamente sus " +
                  "observaciones válidas dentro del intervalo mostrado. No se " +
                  "interpolan ni sincronizan frecuencias."
                : "<strong>Valores originales.</strong> Cada serie conserva sus " +
                  "unidades y frecuencia. Las escalas distintas pueden limitar " +
                  "la comparación visual.";
        } catch (caughtError) {
            console.error(caughtError);
            error.textContent = "No fue posible cargar una o más series seleccionadas.";
        } finally {
            chart.removeAttribute("aria-busy");
            submitButton.disabled = false;
            submitButton.textContent = "Actualizar gráfico";
        }
    }

    function ensureCompare() {
        if (panes.has("compare")) {
            return panes.get("compare");
        }

        const pane = createPane("compare");
        pane.innerHTML = compareMarkup();
        const form = pane.querySelector("[data-compare-form]");
        form.addEventListener("submit", event => {
            event.preventDefault();
            renderComparison(pane);
        });

        renderComparison(pane);
        return pane;
    }

    async function openView(view, moveFocus) {
        if (view !== "overview" && view !== "compare" && !indexViews[view]) {
            view = "overview";
        }

        activeView = view;
        setActiveButton(view);
        content.setAttribute("aria-busy", "true");

        if (view === "overview") {
            ensureOverview();
        } else if (view === "compare") {
            ensureCompare();
        } else {
            await ensureIndexView(view);
        }

        showPane(view);
        content.removeAttribute("aria-busy");

        if (moveFocus) {
            const title = panes.get(view).querySelector(".climate-view-title, h2");
            if (title) {
                title.setAttribute("tabindex", "-1");
                title.focus({preventScroll: true});
            }
        }
    }

    navButtons.forEach(button => {
        button.addEventListener("click", () => {
            const view = button.dataset.climateView;
            closeMenu();
            openView(view, isMobile());
        });
    });

    content.addEventListener("click", event => {
        const documentedDownload = event.target.closest(
            "[data-climate-download-format]"
        );

        if (documentedDownload) {
            if (
                event.button !== 0 ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
            ) {
                return;
            }

            event.preventDefault();
            downloadDocumentedCsv(documentedDownload);
            return;
        }

        const trigger = event.target.closest("[data-open-view]");
        if (trigger) {
            openView(trigger.dataset.openView, false);
        }
    });

    menuButton.addEventListener("click", () => {
        setMenu(!dashboard.classList.contains("is-menu-open"));
    });

    backdrop.addEventListener("click", closeMenu);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && dashboard.classList.contains("is-menu-open")) {
            closeMenu();
            menuButton.focus();
        }
    });

    window.addEventListener("resize", syncSidebarAccessibility);

    ensureOverview();
    showPane(activeView);
    setActiveButton(activeView);
    syncSidebarAccessibility();
})();
