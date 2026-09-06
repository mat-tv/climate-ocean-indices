(function () {

    const root = document.getElementById("climate-sam");

    if (!root) {
        return;
    }

    const dataUrl = root.dataset.dataUrl;
    const metadataUrl = root.dataset.metadataUrl;
    const csvUrl = root.dataset.csvUrl;
    const jsonUrl = root.dataset.jsonUrl;
    const dashboard = root.closest("#climate-dashboard");
    const projectCreator =
        dashboard?.dataset.projectCreator || "MTroncoso-Villar";
    const projectYear = dashboard?.dataset.projectYear || "2026";
    const plotCredit = {
        text:
            `© ${projectYear} ${projectCreator} · ` +
            "Datos: NOAA Climate Prediction Center",
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
    };

    function pngDownloadButton(filename) {
        return {
            name: "Descargar gráfico como PNG",
            icon: Plotly.Icons.camera,
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
            await Plotly.newPlot(exportNode, graph.data, exportLayout, {
                staticPlot: true,
                displayModeBar: false
            });
            await Plotly.downloadImage(exportNode, {
                format: "png",
                filename,
                width,
                height,
                scale: 1
            });
        } finally {
            Plotly.purge(exportNode);
            exportNode.remove();
        }
    }

    root.classList.add("climate-index");

    root.innerHTML = `
        <div class="climate-index-header">

            <div>
                <div class="climate-index-kicker">
                    SOUTHERN HEMISPHERE CIRCULATION
                </div>

                <h2>Southern Annular Mode</h2>

                <div class="climate-index-subtitle">
                    SAM / AAO · NOAA Climate Prediction Center
                </div>
            </div>

            <div class="climate-index-current">

                <div
                    id="sam-current-value"
                    class="climate-index-current-value">
                    …
                </div>

                <div
                    id="sam-current-period"
                    class="climate-index-current-period">
                    Cargando...
                </div>

            </div>

        </div>

        <div
            id="sam-chart"
            class="climate-index-chart">
        </div>

        <div class="climate-index-footer">

            <div
                id="sam-update-info"
                class="climate-index-update">
            </div>

            <div class="climate-index-downloads">

                <a
                    href="${csvUrl}"
                    target="_blank"
                    rel="noopener">
                    Descargar CSV
                </a>

                <a
                    href="${jsonUrl}"
                    target="_blank"
                    rel="noopener">
                    Descargar JSON
                </a>

            </div>

        </div>

        <details class="climate-index-methodology">

            <summary>
                Metodología y metadatos
            </summary>

            <div
                id="sam-metadata"
                class="climate-index-metadata-grid">
            </div>

            <div
                id="sam-time-note"
                class="climate-index-note">
            </div>

            <div
                id="sam-method-links"
                class="climate-index-method-links">
            </div>

        </details>

        <div
            id="sam-error"
            class="climate-index-error">
        </div>
    `;


    Promise.all([

        fetch(dataUrl).then(response => {

            if (!response.ok) {
                throw new Error("No se pudo cargar SAM");
            }

            return response.json();
        }),

        fetch(metadataUrl).then(response => {

            if (!response.ok) {
                throw new Error("No se pudieron cargar los metadatos");
            }

            return response.json();
        })

    ])

    .then(([records, metadata]) => {

        const time = records.map(
            record => record.date
        );

        const values = records.map(
            record =>
                record.sam === null
                    ? null
                    : Number(record.sam)
        );

        const validRecords = records.filter(
            record => record.sam !== null
        );

        const last =
            validRecords[validRecords.length - 1];


        // ====================================================
        // Valor actual
        // ====================================================

        document.getElementById(
            "sam-current-value"
        ).textContent =
            `${last.sam > 0 ? "+" : ""}` +
            `${Number(last.sam).toFixed(2)}`;


        document.getElementById(
            "sam-current-period"
        ).textContent =
            last.date;


        // ====================================================
        // Última consulta
        // ====================================================

        const retrieved =
            new Date(metadata.retrieved_utc);


        document.getElementById(
            "sam-update-info"
        ).textContent =
            `Última consulta a la fuente: ${
                retrieved
                .toISOString()
                .replace("T", " ")
                .slice(0, 16)
            } UTC`;


        // ====================================================
        // Metadatos
        // ====================================================

        document.getElementById(
            "sam-metadata"
        ).innerHTML = `

            <div class="climate-index-metadata-item">
                <span>Fuente</span>
                ${metadata.source_institution}
            </div>

            <div class="climate-index-metadata-item">
                <span>Producto original</span>
                ${metadata.source_name} (${metadata.source_short_name})
            </div>

            <div class="climate-index-metadata-item">
                <span>Resolución</span>
                ${metadata.temporal_resolution}
            </div>

            <div class="climate-index-metadata-item">
                <span>Unidad</span>
                Índice estandarizado
            </div>

            <div class="climate-index-metadata-item">
                <span>Período de referencia</span>
                ${metadata.reference_period}
            </div>

            <div class="climate-index-metadata-item">
                <span>Último dato disponible</span>
                ${last.date}
            </div>

        `;


        document.getElementById(
            "sam-time-note"
        ).innerHTML =
            `<strong>Representación temporal.</strong> ` +
            metadata.time_representation;


        document.getElementById(
            "sam-method-links"
        ).innerHTML = `

            <a
                href="${metadata.source_page_url}"
                target="_blank"
                rel="noopener">
                Fuente oficial
            </a>

            <a
                href="${metadata.methodology_url}"
                target="_blank"
                rel="noopener">
                Metodología oficial
            </a>

        `;


        // ====================================================
        // Intervalo inicial: un año
        // ====================================================

        const endDate =
            new Date(`${last.date}T00:00:00Z`);

        const startDate =
            new Date(endDate);

        startDate.setUTCFullYear(
            startDate.getUTCFullYear() - 1
        );


        // ====================================================
        // Plotly
        // ====================================================

        const trace = {

            x: time,
            y: values,

            type: "scatter",
            mode: "lines",

            hovertemplate:
                "<b>%{x|%Y-%m-%d}</b><br>" +
                "SAM: %{y:.2f}" +
                "<extra></extra>"
        };


        const layout = {

            margin: {
                l: 60,
                r: 25,
                t: 30,
                b: 72
            },

            hovermode: "x unified",

            xaxis: {

                type: "date",

                range: [
                    startDate
                        .toISOString()
                        .slice(0, 10),

                    last.date
                ],

                rangeselector: {

                    buttons: [

                        {
                            count: 30,
                            label: "30 días",
                            step: "day",
                            stepmode: "backward"
                        },

                        {
                            count: 1,
                            label: "1 año",
                            step: "year",
                            stepmode: "backward"
                        },

                        {
                            count: 5,
                            label: "5 años",
                            step: "year",
                            stepmode: "backward"
                        },

                        {
                            step: "all",
                            label: "Todo"
                        }

                    ]
                },

                showgrid: true,
                zeroline: false
            },

            yaxis: {

                title: {
                    text: "SAM / AAO"
                },

                zeroline: true,
                zerolinewidth: 1,

                showgrid: true
            },

            annotations: [plotCredit],

            showlegend: false,

            paper_bgcolor:
                "rgba(0,0,0,0)",

            plot_bgcolor:
                "rgba(0,0,0,0)"
        };


        const config = {

            responsive: true,
            displaylogo: false,
            scrollZoom: true,

            modeBarButtonsToRemove: ["toImage"],
            modeBarButtonsToAdd: [pngDownloadButton("SAM_AAO")]
        };


        Plotly.newPlot(
            "sam-chart",
            [trace],
            layout,
            config
        );

    })


    .catch(error => {

        console.error(error);

        document.getElementById(
            "sam-error"
        ).textContent =
            "No fue posible cargar los datos de SAM.";

    });

})();
