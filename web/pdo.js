(function () {

    const root = document.getElementById("climate-pdo");

    if (!root) {
        return;
    }

    const dataUrl = root.dataset.dataUrl;
    const metadataUrl = root.dataset.metadataUrl;
    const csvUrl = root.dataset.csvUrl;
    const jsonUrl = root.dataset.jsonUrl;

    root.classList.add("climate-index");

    root.innerHTML = `
        <div class="climate-index-header">

            <div>
                <div class="climate-index-kicker">
                    VARIABILIDAD DECADAL DEL PACÍFICO
                </div>

                <h2>Pacific Decadal Oscillation</h2>

                <div class="climate-index-subtitle">
                    PDO · NOAA Physical Sciences Laboratory
                </div>
            </div>

            <div class="climate-index-current">

                <div
                    id="pdo-current-value"
                    class="climate-index-current-value">
                    —
                </div>

                <div
                    id="pdo-current-period"
                    class="climate-index-current-period">
                    Cargando...
                </div>

            </div>

        </div>

        <div
            id="pdo-chart"
            class="climate-index-chart">
        </div>

        <div class="climate-index-footer">

            <div
                id="pdo-update-info"
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
                id="pdo-metadata"
                class="climate-index-metadata-grid">
            </div>

            <div
                id="pdo-definition-note"
                class="climate-index-note">
            </div>

            <div
                id="pdo-time-note"
                class="climate-index-note">
            </div>

            <div
                id="pdo-documentation-note"
                class="climate-index-note">
            </div>

            <div
                id="pdo-usage-note"
                class="climate-index-note">
            </div>

            <div
                id="pdo-method-links"
                class="climate-index-method-links">
            </div>

        </details>

        <div
            id="pdo-error"
            class="climate-index-error">
        </div>
    `;


    Promise.all([

        fetch(dataUrl).then(response => {

            if (!response.ok) {
                throw new Error(
                    "No se pudo cargar PDO"
                );
            }

            return response.json();
        }),

        fetch(metadataUrl).then(response => {

            if (!response.ok) {
                throw new Error(
                    "No se pudieron cargar los metadatos de PDO"
                );
            }

            return response.json();
        })

    ])

    .then(([records, metadata]) => {

        const validRecords = records.filter(
            record => record.pdo !== null
        );

        const last =
            validRecords[validRecords.length - 1];


        // ====================================================
        // Valor actual
        // ====================================================

        document.getElementById(
            "pdo-current-value"
        ).textContent =
            `${last.pdo > 0 ? "+" : ""}` +
            `${Number(last.pdo).toFixed(2)} °C`;


        const lastDate =
            new Date(`${last.date}T00:00:00Z`);

        const monthLabel =
            lastDate.toLocaleDateString(
                "es-CL",
                {
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC"
                }
            );


        document.getElementById(
            "pdo-current-period"
        ).textContent =
            monthLabel;


        // ====================================================
        // Última consulta
        // ====================================================

        const retrieved =
            new Date(metadata.retrieved_utc);


        document.getElementById(
            "pdo-update-info"
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
            "pdo-metadata"
        ).innerHTML = `

            <div class="climate-index-metadata-item">
                <span>Fuente</span>
                ${metadata.source_institution}
            </div>

            <div class="climate-index-metadata-item">
                <span>Producto</span>
                ${metadata.source_product}
            </div>

            <div class="climate-index-metadata-item">
                <span>Resolución</span>
                ${metadata.temporal_resolution}
            </div>

            <div class="climate-index-metadata-item">
                <span>Unidad</span>
                °C
            </div>

            <div class="climate-index-metadata-item">
                <span>Período EOF / climatología</span>
                ${metadata.reference_period}
            </div>

            <div class="climate-index-metadata-item">
                <span>Último dato disponible</span>
                ${last.date.slice(0, 7)}
            </div>

        `;


        document.getElementById(
            "pdo-definition-note"
        ).innerHTML =
            `<strong>Definición.</strong> ` +
            `El PDO de NOAA PSL corresponde al EOF principal de las ` +
            `anomalías mensuales de temperatura superficial del mar ` +
            `del Pacífico Norte entre 20°N y 70°N. Antes del cálculo ` +
            `se remueven la climatología mensual y la anomalía media ` +
            `global de SST.`;


        document.getElementById(
            "pdo-time-note"
        ).innerHTML =
            `<strong>Representación temporal.</strong> ` +
            `Cada valor mensual se representa en el primer día de su ` +
            `mes calendario. El portal no interpola, suaviza ni agrega ` +
            `temporalmente la serie original.`;


        document.getElementById(
            "pdo-documentation-note"
        ).innerHTML =
            `<strong>Nota de cobertura.</strong> ` +
            metadata.documentation_note;


        document.getElementById(
            "pdo-usage-note"
        ).innerHTML =
            `<strong>Uso y atribución.</strong> ` +
            metadata.usage.attribution;


        document.getElementById(
            "pdo-method-links"
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
                Newman et al. (2016)
            </a>

            <a
                href="${metadata.format_url}"
                target="_blank"
                rel="noopener">
                Formato NOAA PSL
            </a>

            <a
                href="${metadata.usage.usage_url}"
                target="_blank"
                rel="noopener">
                Condiciones de uso NOAA PSL
            </a>

        `;


        // ====================================================
        // Serie temporal
        // ====================================================

        const time =
            records.map(
                record => record.date
            );


        const values =
            records.map(
                record =>
                    record.pdo === null
                        ? null
                        : Number(record.pdo)
            );


        const endDate =
            new Date(`${last.date}T00:00:00Z`);

        const startDate =
            new Date(endDate);

        startDate.setUTCFullYear(
            startDate.getUTCFullYear() - 20
        );


        const trace = {

            x: time,
            y: values,

            type: "scatter",
            mode: "lines",

            hovertemplate:
                "<b>%{x|%Y-%m}</b><br>" +
                "PDO: %{y:.3f} °C" +
                "<extra></extra>"
        };


        const layout = {

            margin: {
                l: 60,
                r: 25,
                t: 30,
                b: 50
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
                            count: 5,
                            label: "5 años",
                            step: "year",
                            stepmode: "backward"
                        },

                        {
                            count: 20,
                            label: "20 años",
                            step: "year",
                            stepmode: "backward"
                        },

                        {
                            count: 50,
                            label: "50 años",
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
                    text: "PDO [°C]"
                },

                zeroline: true,
                zerolinewidth: 1,

                showgrid: true
            },

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

            toImageButtonOptions: {
                format: "png",
                filename: "PDO"
            }
        };


        Plotly.newPlot(
            "pdo-chart",
            [trace],
            layout,
            config
        );

    })


    .catch(error => {

        console.error(error);

        document.getElementById(
            "pdo-error"
        ).textContent =
            "No fue posible cargar los datos de PDO.";

    });

})();
