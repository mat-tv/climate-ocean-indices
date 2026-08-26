(function () {

    const root = document.getElementById("climate-mjo");

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
                    VARIABILIDAD INTRAESTACIONAL TROPICAL
                </div>

                <h2>Madden–Julian Oscillation</h2>

                <div class="climate-index-subtitle">
                    MJO / ROMI · NOAA Physical Sciences Laboratory
                </div>
            </div>

            <div class="climate-index-current">
                <div
                    id="mjo-current-value"
                    class="climate-index-current-value">
                    —
                </div>

                <div
                    id="mjo-current-period"
                    class="climate-index-current-period">
                    Cargando...
                </div>
            </div>

        </div>

        <div class="climate-index-chart-grid">
            <div>
                <div class="climate-index-chart-title">
                    Diagrama de fase ROMI · orientación RMM · últimos 40 días válidos
                </div>

                <div
                    id="mjo-phase-chart"
                    class="mjo-phase-chart">
                </div>
            </div>

            <div>
                <div class="climate-index-chart-title">
                    Amplitud ROMI
                </div>

                <div
                    id="mjo-amplitude-chart"
                    class="mjo-amplitude-chart">
                </div>
            </div>
        </div>

        <div class="climate-index-footer">

            <div
                id="mjo-update-info"
                class="climate-index-update">
            </div>

            <div class="climate-index-downloads">
                <a href="${csvUrl}" target="_blank" rel="noopener">
                    Descargar CSV
                </a>

                <a href="${jsonUrl}" target="_blank" rel="noopener">
                    Descargar JSON
                </a>
            </div>

        </div>

        <details class="climate-index-methodology">

            <summary>
                Metodología y metadatos
            </summary>

            <div
                id="mjo-metadata"
                class="climate-index-metadata-grid">
            </div>

            <div
                id="mjo-definition-note"
                class="climate-index-note">
            </div>

            <div
                id="mjo-phase-note"
                class="climate-index-note">
            </div>

            <div
                id="mjo-distinction-note"
                class="climate-index-note">
            </div>

            <div class="climate-index-note">
                <strong>Datos faltantes.</strong>
                Los valores faltantes de la fuente se conservan como
                valores nulos; no se rellenan ni interpolan.
                Registros con valores faltantes:
                <span id="mjo-missing-count">—</span>.
            </div>

            <div
                id="mjo-method-links"
                class="climate-index-method-links">
            </div>

        </details>

        <div
            id="mjo-error"
            class="climate-index-error">
        </div>
    `;


    Promise.all([

        fetch(dataUrl).then(response => {
            if (!response.ok) {
                throw new Error("No se pudo cargar MJO / ROMI");
            }

            return response.json();
        }),

        fetch(metadataUrl).then(response => {
            if (!response.ok) {
                throw new Error(
                    "No se pudieron cargar los metadatos de MJO / ROMI"
                );
            }

            return response.json();
        })

    ])

    .then(([records, metadata]) => {

        const validRecords = records.filter(
            record =>
                record.romi_pc1 !== null &&
                record.romi_pc2 !== null &&
                record.phase_space_x !== null &&
                record.phase_space_y !== null &&
                record.phase !== null &&
                record.amplitude !== null
        );

        const last =
            validRecords[validRecords.length - 1];


        // ====================================================
        // Estado actual
        // ====================================================

        const lastAmplitude =
            Number(last.amplitude);

        document.getElementById(
            "mjo-current-value"
        ).textContent =
            lastAmplitude >= 1
                ? `Fase ${last.phase}`
                : "Señal débil";

        document.getElementById(
            "mjo-current-period"
        ).textContent =
            `Amplitud ${lastAmplitude.toFixed(2)} · ${last.date}`;


        // ====================================================
        // Última consulta
        // ====================================================

        const retrieved =
            new Date(metadata.retrieved_utc);

        document.getElementById(
            "mjo-update-info"
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
            "mjo-metadata"
        ).innerHTML = `

            <div class="climate-index-metadata-item">
                <span>Fuente</span>
                ${metadata.source_institution}
            </div>

            <div class="climate-index-metadata-item">
                <span>Producto</span>
                ${metadata.index_name} (${metadata.index_short_name})
            </div>

            <div class="climate-index-metadata-item">
                <span>Resolución</span>
                ${metadata.temporal_resolution}
            </div>

            <div class="climate-index-metadata-item">
                <span>Unidad</span>
                ${metadata.units}
            </div>

            <div class="climate-index-metadata-item">
                <span>Primer dato</span>
                ${metadata.first_record.date}
            </div>

            <div class="climate-index-metadata-item">
                <span>Último dato válido</span>
                ${last.date}
            </div>
        `;


        document.getElementById(
            "mjo-definition-note"
        ).innerHTML =
            `<strong>Definición.</strong> ` +
            `ROMI es un índice convectivo de la MJO basado en OLR. ` +
            `NOAA PSL proyecta anomalías de OLR suavizadas sobre ` +
            `patrones EOF espaciales que varían con el día del año.`;


        document.getElementById(
            "mjo-phase-note"
        ).innerHTML =
            `<strong>Diagrama de fase.</strong> ` +
            `Para compararlo visualmente con la orientación convencional ` +
            `de Wheeler–Hendon, NOAA PSL indica usar ` +
            `x = ROMI PC2 e y = −ROMI PC1. ` +
            `Las fases 1–8 mostradas aquí son derivadas por este portal ` +
            `a partir de esos ocho sectores de 45°. ` +
            `Una amplitud menor que 1 se presenta como señal débil.`;


        document.getElementById(
            "mjo-distinction-note"
        ).innerHTML =
            `<strong>ROMI no es RMM.</strong> ` +
            `ROMI utiliza únicamente radiación de onda larga saliente ` +
            `(OLR), mientras que el RMM de Wheeler–Hendon es multivariado ` +
            `e incorpora OLR y vientos zonales a 850 y 200 hPa. ` +
            `La reorientación del diagrama permite comparar las fases, ` +
            `pero no convierte ROMI en RMM.`;


        document.getElementById(
            "mjo-missing-count"
        ).textContent =
            metadata.missing_value_count;


        document.getElementById(
            "mjo-method-links"
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
                Kiladis et al. (2014)
            </a>

            <a
                href="${metadata.format_url}"
                target="_blank"
                rel="noopener">
                Formato de los datos
            </a>

            <a
                href="${metadata.usage_url}"
                target="_blank"
                rel="noopener">
                Condiciones de uso NOAA PSL
            </a>
        `;


        // ====================================================
        // Diagrama de fase: últimos 40 días válidos
        // ====================================================

        const recent =
            validRecords.slice(-40);

        const phaseX =
            recent.map(
                record =>
                    Number(record.phase_space_x)
            );

        const phaseY =
            recent.map(
                record =>
                    Number(record.phase_space_y)
            );

        const phaseDates =
            recent.map(
                record => record.date
            );

        const phaseNumbers =
            recent.map(
                record => record.phase
            );

        const phaseAmplitudes =
            recent.map(
                record =>
                    Number(record.amplitude)
            );

        const phasePc1 =
            recent.map(
                record =>
                    Number(record.romi_pc1)
            );

        const phasePc2 =
            recent.map(
                record =>
                    Number(record.romi_pc2)
            );


        const maxAbs = Math.max(
            4,
            ...phaseX.map(Math.abs),
            ...phaseY.map(Math.abs)
        );

        const limit =
            Math.ceil(maxAbs * 1.10);


        const trajectoryTrace = {

            x: phaseX,
            y: phaseY,

            type: "scatter",
            mode: "lines+markers",

            marker: {
                size: 5
            },

            line: {
                width: 1.5
            },

            customdata:
                phaseDates.map(
                    (date, i) => [
                        date,
                        phaseNumbers[i],
                        phaseAmplitudes[i],
                        phasePc1[i],
                        phasePc2[i]
                    ]
                ),

            hovertemplate:
                "<b>%{customdata[0]}</b><br>" +
                "Fase: %{customdata[1]}<br>" +
                "ROMI PC1: %{customdata[3]:.2f}<br>" +
                "ROMI PC2: %{customdata[4]:.2f}<br>" +
                "Amplitud: %{customdata[2]:.2f}" +
                "<extra></extra>",

            showlegend: false
        };


        const currentTrace = {

            x: [
                Number(last.phase_space_x)
            ],

            y: [
                Number(last.phase_space_y)
            ],

            type: "scatter",
            mode: "markers",

            marker: {
                size: 12,
                symbol: "circle-open",
                line: {
                    width: 3
                }
            },

            hovertemplate:
                `<b>${last.date}</b><br>` +
                `Fase: ${last.phase}<br>` +
                `ROMI PC1: ${Number(last.romi_pc1).toFixed(2)}<br>` +
                `ROMI PC2: ${Number(last.romi_pc2).toFixed(2)}<br>` +
                `Amplitud: ${Number(last.amplitude).toFixed(2)}` +
                "<extra></extra>",

            showlegend: false
        };


        const phaseAnnotations = [

            {text: "1", x: -0.78, y: -0.32},
            {text: "2", x: -0.32, y: -0.78},
            {text: "3", x:  0.32, y: -0.78},
            {text: "4", x:  0.78, y: -0.32},
            {text: "5", x:  0.78, y:  0.32},
            {text: "6", x:  0.32, y:  0.78},
            {text: "7", x: -0.32, y:  0.78},
            {text: "8", x: -0.78, y:  0.32}

        ].map(item => ({

            text:
                `Fase ${item.text}`,

            x:
                item.x * limit,

            y:
                item.y * limit,

            showarrow: false,
            opacity: 0.55,

            font: {
                size: 11
            }

        }));


        const phaseLayout = {

            margin: {
                l: 60,
                r: 25,
                t: 20,
                b: 55
            },

            xaxis: {

                title: {
                    text: "ROMI PC2"
                },

                range: [
                    -limit,
                    limit
                ],

                zeroline: true,
                showgrid: true,

                scaleanchor: "y",
                scaleratio: 1
            },

            yaxis: {

                title: {
                    text: "−ROMI PC1"
                },

                range: [
                    -limit,
                    limit
                ],

                zeroline: true,
                showgrid: true
            },

            shapes: [

                {
                    type: "circle",

                    xref: "x",
                    yref: "y",

                    x0: -1,
                    y0: -1,
                    x1: 1,
                    y1: 1,

                    line: {
                        width: 1,
                        dash: "dot"
                    }
                },

                {
                    type: "line",

                    x0: -limit,
                    y0: -limit,

                    x1: limit,
                    y1: limit,

                    line: {
                        width: 1,
                        dash: "dot"
                    }
                },

                {
                    type: "line",

                    x0: -limit,
                    y0: limit,

                    x1: limit,
                    y1: -limit,

                    line: {
                        width: 1,
                        dash: "dot"
                    }
                }

            ],

            annotations:
                phaseAnnotations,

            showlegend: false,

            paper_bgcolor:
                "rgba(0,0,0,0)",

            plot_bgcolor:
                "rgba(0,0,0,0)"
        };


        const phaseConfig = {

            responsive: true,
            displaylogo: false,
            scrollZoom: false,

            toImageButtonOptions: {
                format: "png",
                filename: "MJO_ROMI_phase"
            }
        };


        Plotly.newPlot(
            "mjo-phase-chart",
            [
                trajectoryTrace,
                currentTrace
            ],
            phaseLayout,
            phaseConfig
        );


        // ====================================================
        // Serie temporal de amplitud
        // ====================================================

        const time =
            records.map(
                record => record.date
            );


        const amplitudes =
            records.map(
                record =>
                    record.amplitude === null
                        ? null
                        : Number(record.amplitude)
            );


        const phases =
            records.map(
                record => record.phase
            );


        const endDate =
            new Date(
                `${last.date}T00:00:00Z`
            );

        const startDate =
            new Date(endDate);

        startDate.setUTCFullYear(
            startDate.getUTCFullYear() - 1
        );


        const amplitudeTrace = {

            x: time,
            y: amplitudes,

            type: "scatter",
            mode: "lines",

            customdata: phases,

            hovertemplate:
                "<b>%{x|%Y-%m-%d}</b><br>" +
                "Amplitud ROMI: %{y:.2f}<br>" +
                "Fase: %{customdata}" +
                "<extra></extra>"
        };


        const amplitudeLayout = {

            margin: {
                l: 55,
                r: 25,
                t: 20,
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
                    text: "Amplitud ROMI"
                },

                rangemode: "tozero",
                showgrid: true
            },

            shapes: [

                {
                    type: "line",

                    xref: "paper",

                    x0: 0,
                    x1: 1,

                    y0: 1,
                    y1: 1,

                    line: {
                        width: 1,
                        dash: "dot"
                    }
                }

            ],

            showlegend: false,

            paper_bgcolor:
                "rgba(0,0,0,0)",

            plot_bgcolor:
                "rgba(0,0,0,0)"
        };


        const amplitudeConfig = {

            responsive: true,
            displaylogo: false,
            scrollZoom: true,

            toImageButtonOptions: {
                format: "png",
                filename: "MJO_ROMI_amplitude"
            }
        };


        Plotly.newPlot(
            "mjo-amplitude-chart",
            [amplitudeTrace],
            amplitudeLayout,
            amplitudeConfig
        );

    })


    .catch(error => {

        console.error(error);

        document.getElementById(
            "mjo-error"
        ).textContent =
            "No fue posible cargar los datos de MJO / ROMI.";

    });

})();
