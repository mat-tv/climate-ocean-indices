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
                    MJO / RMM · Australian Bureau of Meteorology
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
                    Diagrama de fase RMM · últimos 40 días válidos
                </div>
                <div
                    id="mjo-phase-chart"
                    class="mjo-phase-chart">
                </div>
            </div>

            <div>
                <div class="climate-index-chart-title">
                    Amplitud RMM
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

            <div class="climate-index-note">
                <strong>Representación temporal.</strong>
                Cada registro conserva el día calendario original del
                producto RMM del Bureau of Meteorology. No se aplica
                agregación temporal ni interpolación.
            </div>

            <div class="climate-index-note">
                <strong>Cambio metodológico de la fuente.</strong>
                Hasta fines de 2013 el producto utiliza la metodología
                Wheeler–Hendon (2004). Desde 2014 utiliza la metodología
                modificada descrita por Gottschalck et al. (2010).
                El archivo fuente también documenta un cambio en el
                tratamiento de la variabilidad ENSO desde 2014.
            </div>

            <div class="climate-index-note">
                <strong>Datos faltantes.</strong>
                Los valores faltantes publicados por la fuente se conservan
                como valores nulos; no se rellenan ni interpolan.
                Registros faltantes en la fuente:
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
                throw new Error("No se pudo cargar MJO");
            }
            return response.json();
        }),

        fetch(metadataUrl).then(response => {
            if (!response.ok) {
                throw new Error("No se pudieron cargar los metadatos de MJO");
            }
            return response.json();
        })

    ])

    .then(([records, metadata]) => {

        const validRecords = records.filter(
            record =>
                record.rmm1 !== null &&
                record.rmm2 !== null &&
                record.phase !== null &&
                record.amplitude !== null
        );

        const last = validRecords[validRecords.length - 1];


        // ====================================================
        // Estado actual
        // ====================================================

        document.getElementById("mjo-current-value").textContent =
            `Fase ${last.phase}`;

        document.getElementById("mjo-current-period").textContent =
            `Amplitud ${Number(last.amplitude).toFixed(2)} · ${last.date}`;


        // ====================================================
        // Última consulta
        // ====================================================

        const retrieved = new Date(metadata.retrieved_utc);

        document.getElementById("mjo-update-info").textContent =
            `Última consulta a la fuente: ${
                retrieved.toISOString().replace("T", " ").slice(0, 16)
            } UTC`;


        // ====================================================
        // Metadatos
        // ====================================================

        document.getElementById("mjo-metadata").innerHTML = `

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
                diaria
            </div>

            <div class="climate-index-metadata-item">
                <span>Unidad</span>
                adimensional
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

        document.getElementById("mjo-missing-count").textContent =
            metadata.missing_value_count;

        document.getElementById("mjo-method-links").innerHTML = `
            <a
                href="${metadata.source_page_url}"
                target="_blank"
                rel="noopener">
                Fuente oficial
            </a>

            <a
                href="${metadata.methodology_wh04_url}"
                target="_blank"
                rel="noopener">
                Wheeler y Hendon (2004)
            </a>

            <a
                href="${metadata.methodology_gottschalck2010_url}"
                target="_blank"
                rel="noopener">
                Gottschalck et al. (2010)
            </a>
        `;


        // ====================================================
        // Diagrama de fase: últimos 40 días válidos
        // ====================================================

        const recent = validRecords.slice(-40);

        const phaseX = recent.map(record => Number(record.rmm1));
        const phaseY = recent.map(record => Number(record.rmm2));
        const phaseDates = recent.map(record => record.date);
        const phaseNumbers = recent.map(record => record.phase);
        const phaseAmplitudes = recent.map(record => Number(record.amplitude));

        const maxAbs = Math.max(
            4,
            ...phaseX.map(Math.abs),
            ...phaseY.map(Math.abs)
        );

        const limit = Math.ceil(maxAbs * 1.10);

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
            customdata: phaseDates.map((date, i) => [
                date,
                phaseNumbers[i],
                phaseAmplitudes[i]
            ]),
            hovertemplate:
                "<b>%{customdata[0]}</b><br>" +
                "Fase: %{customdata[1]}<br>" +
                "RMM1: %{x:.2f}<br>" +
                "RMM2: %{y:.2f}<br>" +
                "Amplitud: %{customdata[2]:.2f}" +
                "<extra></extra>",
            showlegend: false
        };

        const currentTrace = {
            x: [Number(last.rmm1)],
            y: [Number(last.rmm2)],
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
                `RMM1: ${Number(last.rmm1).toFixed(2)}<br>` +
                `RMM2: ${Number(last.rmm2).toFixed(2)}<br>` +
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
            text: `Fase ${item.text}`,
            x: item.x * limit,
            y: item.y * limit,
            showarrow: false,
            opacity: 0.55,
            font: {
                size: 11
            }
        }));

        const phaseLayout = {
            margin: {
                l: 55,
                r: 25,
                t: 20,
                b: 50
            },

            xaxis: {
                title: {
                    text: "RMM1"
                },
                range: [-limit, limit],
                zeroline: true,
                showgrid: true,
                scaleanchor: "y",
                scaleratio: 1
            },

            yaxis: {
                title: {
                    text: "RMM2"
                },
                range: [-limit, limit],
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

            annotations: phaseAnnotations,

            showlegend: false,
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)"
        };

        const phaseConfig = {
            responsive: true,
            displaylogo: false,
            scrollZoom: false,
            toImageButtonOptions: {
                format: "png",
                filename: "MJO_RMM_phase"
            }
        };

        Plotly.newPlot(
            "mjo-phase-chart",
            [trajectoryTrace, currentTrace],
            phaseLayout,
            phaseConfig
        );


        // ====================================================
        // Serie temporal de amplitud
        // ====================================================

        const time = records.map(record => record.date);

        const amplitudes = records.map(
            record =>
                record.amplitude === null
                    ? null
                    : Number(record.amplitude)
        );

        const phases = records.map(record => record.phase);

        const endDate = new Date(`${last.date}T00:00:00Z`);
        const startDate = new Date(endDate);
        startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);

        const amplitudeTrace = {
            x: time,
            y: amplitudes,
            type: "scatter",
            mode: "lines",
            customdata: phases,
            hovertemplate:
                "<b>%{x|%Y-%m-%d}</b><br>" +
                "Amplitud: %{y:.2f}<br>" +
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
                    startDate.toISOString().slice(0, 10),
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
                    text: "Amplitud RMM"
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
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)"
        };

        const amplitudeConfig = {
            responsive: true,
            displaylogo: false,
            scrollZoom: true,
            toImageButtonOptions: {
                format: "png",
                filename: "MJO_RMM_amplitude"
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

        document.getElementById("mjo-error").textContent =
            "No fue posible cargar los datos de MJO.";
    });

})();
