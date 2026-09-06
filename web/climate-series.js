(function () {
    "use strict";

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatValue(value, series) {
        const number = Number(value);
        const sign = series.signed !== false && number > 0 ? "+" : "";
        return `${sign}${number.toFixed(series.digits ?? 2)}${series.unit ? ` ${series.unit}` : ""}`;
    }

    function formatPeriod(record, resolution) {
        if (record.season) {
            return `${record.season} ${record.year}`;
        }
        const date = new Date(`${record.date}T00:00:00Z`);
        return date.toLocaleDateString("es-CL", {
            day: resolution === "daily" ? "numeric" : undefined,
            month: "short",
            year: "numeric",
            timeZone: "UTC"
        });
    }

    function pngDownloadButton(filename) {
        return {
            name: "Descargar gráfico como PNG",
            icon: window.Plotly.Icons.camera,
            click: graph => downloadCleanPng(graph, filename)
        };
    }

    async function downloadCleanPng(graph, filename) {
        const width = Math.round(graph._fullLayout?.width || graph.clientWidth || 900);
        const height = Math.round(graph._fullLayout?.height || graph.clientHeight || 500);
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

    function metadataItem(label, value) {
        return `
            <div class="climate-index-metadata-item">
                <span>${escapeHtml(label)}</span>
                ${escapeHtml(value)}
            </div>
        `;
    }

    function note(label, value) {
        return value
            ? `<div class="climate-index-note"><strong>${escapeHtml(label)}.</strong> ${escapeHtml(value)}</div>`
            : "";
    }

    async function init(root, view) {
        if (!root || root.dataset.climateSeriesReady === "true") {
            return;
        }
        root.dataset.climateSeriesReady = "true";
        root.classList.add("climate-index");
        root.innerHTML = `
            <div class="climate-index-header">
                <div>
                    <div class="climate-index-kicker">${escapeHtml(view.kicker)}</div>
                    <h2>${escapeHtml(view.title)}</h2>
                    <div class="climate-index-subtitle">${escapeHtml(view.subtitle)}</div>
                </div>
                <div class="climate-index-current">
                    <div class="climate-index-current-value" data-series-current>…</div>
                    <div class="climate-index-current-period" data-series-period>Cargando...</div>
                    <div class="climate-index-current-secondary" data-series-secondary></div>
                </div>
            </div>
            <div class="climate-index-chart" data-series-chart></div>
            <div class="climate-index-footer">
                <div class="climate-index-update" data-series-update></div>
                <div class="climate-index-downloads">
                    <a href="${escapeHtml(root.dataset.csvUrl)}" target="_blank" rel="noopener">Descargar CSV</a>
                    <a href="${escapeHtml(root.dataset.jsonUrl)}" target="_blank" rel="noopener">Descargar JSON</a>
                </div>
            </div>
            <details class="climate-index-methodology">
                <summary>Metodología y metadatos</summary>
                <div class="climate-index-metadata-grid" data-series-metadata></div>
                <div data-series-notes></div>
                <div class="climate-index-method-links" data-series-links></div>
            </details>
            <div class="climate-index-error" data-series-error></div>
        `;

        const chart = root.querySelector("[data-series-chart]");
        const errorNode = root.querySelector("[data-series-error]");

        try {
            const [dataResponse, metadataResponse] = await Promise.all([
                fetch(root.dataset.dataUrl),
                fetch(root.dataset.metadataUrl)
            ]);
            if (!dataResponse.ok || !metadataResponse.ok) {
                throw new Error("No se pudieron cargar los datos o metadatos");
            }
            const records = await dataResponse.json();
            const metadata = await metadataResponse.json();
            const valid = records.filter(record =>
                view.series.some(series => Number.isFinite(Number(record[series.key])))
            );
            const last = [...valid].reverse().find(record =>
                Number.isFinite(Number(record[view.primaryKey]))
            );
            if (!last) {
                throw new Error("La serie no contiene observaciones válidas");
            }

            const primary = view.series.find(series => series.key === view.primaryKey);
            root.querySelector("[data-series-current]").textContent =
                formatValue(last[primary.key], primary);
            root.querySelector("[data-series-period]").textContent =
                `${primary.label} · ${formatPeriod(last, metadata.temporal_resolution)}`;

            if (view.secondaryCurrentKey) {
                const secondary = view.series.find(series => series.key === view.secondaryCurrentKey);
                const secondaryRecord = [...valid].reverse().find(record =>
                    Number.isFinite(Number(record[secondary.key]))
                );
                if (secondaryRecord) {
                    root.querySelector("[data-series-secondary]").textContent =
                        `${secondary.label}: ${formatValue(secondaryRecord[secondary.key], secondary)}`;
                }
            }

            const retrieved = new Date(metadata.retrieved_utc);
            root.querySelector("[data-series-update]").textContent =
                `Última consulta a la fuente: ${retrieved.toISOString().replace("T", " ").slice(0, 16)} UTC`;

            root.querySelector("[data-series-metadata]").innerHTML = [
                metadataItem("Fuente", metadata.source_institution),
                metadataItem("Dataset", metadata.source_dataset),
                metadataItem("Resolución", metadata.temporal_resolution),
                metadataItem("Unidad", metadata.units),
                metadataItem("Período de referencia", metadata.reference_period),
                metadataItem("Último dato disponible", formatPeriod(last, metadata.temporal_resolution))
            ].join("");

            root.querySelector("[data-series-notes]").innerHTML = [
                note("Definición", metadata.definition),
                note("Representación temporal", metadata.time_representation),
                note("Nota sobre los datos", metadata.data_note),
                note("Citación recomendada", metadata.citation)
            ].join("");

            root.querySelector("[data-series-links]").innerHTML = `
                <a href="${escapeHtml(metadata.source_page_url)}" target="_blank" rel="noopener">Fuente oficial</a>
                <a href="${escapeHtml(metadata.methodology_url)}" target="_blank" rel="noopener">Metodología oficial</a>
            `;

            const latestDate = new Date(`${last.date}T00:00:00Z`);
            const startDate = new Date(latestDate);
            startDate.setUTCFullYear(startDate.getUTCFullYear() - (view.defaultYears || 5));

            const traces = view.series.map(series => ({
                x: records.map(record => record.date),
                y: records.map(record => record[series.key]),
                type: "scatter",
                mode: "lines",
                name: series.label,
                yaxis: series.secondaryAxis ? "y2" : "y",
                line: series.dash ? {dash: series.dash} : undefined,
                connectgaps: false,
                hovertemplate:
                    `<b>${escapeHtml(series.label)}</b><br>%{x|${metadata.temporal_resolution === "daily" ? "%Y-%m-%d" : "%Y-%m"}}<br>` +
                    `Valor: %{y:.${series.digits ?? 2}f}${series.unit ? ` ${escapeHtml(series.unit)}` : ""}<extra></extra>`
            }));

            const dashboard = root.closest("#climate-dashboard");
            const creator = dashboard?.dataset.projectCreator || "MTroncoso-Villar";
            const year = dashboard?.dataset.projectYear || "2026";
            const layout = {
                margin: {l: 62, r: view.secondaryAxisTitle ? 64 : 25, t: 38, b: 72},
                hovermode: "x unified",
                xaxis: {
                    type: "date",
                    range: [startDate.toISOString().slice(0, 10), last.date],
                    rangeselector: {
                        buttons: [
                            {count: 1, label: "1 año", step: "year", stepmode: "backward"},
                            {count: 5, label: "5 años", step: "year", stepmode: "backward"},
                            {count: 20, label: "20 años", step: "year", stepmode: "backward"},
                            {step: "all", label: "Todo"}
                        ]
                    },
                    showgrid: true,
                    zeroline: false
                },
                yaxis: {title: {text: view.yAxisTitle}, showgrid: true, zeroline: true},
                legend: {
                    orientation: "h",
                    x: 0,
                    y: 1.12,
                    yanchor: "bottom"
                },
                annotations: [{
                    text: `© ${escapeHtml(year)} ${escapeHtml(creator)} · Datos: ${escapeHtml(view.creditSource)}`,
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
            if (view.secondaryAxisTitle) {
                layout.yaxis2 = {
                    title: {text: view.secondaryAxisTitle},
                    overlaying: "y",
                    side: "right",
                    showgrid: false,
                    zeroline: true
                };
            }

            await window.Plotly.newPlot(chart, traces, layout, {
                responsive: true,
                displaylogo: false,
                scrollZoom: true,
                modeBarButtonsToRemove: ["toImage"],
                modeBarButtonsToAdd: [pngDownloadButton(view.pngFilename)]
            });
        } catch (error) {
            console.error(error);
            errorNode.textContent = `No fue posible cargar los datos de ${view.shortLabel}.`;
            root.dataset.climateSeriesReady = "false";
            throw error;
        }
    }

    window.ClimateSeries = {init};
})();
