(function () {

    const root = document.getElementById("climate-roni");

    if (!root) {
        return;
    }

    const dataUrl = root.dataset.dataUrl;
    const metadataUrl = root.dataset.metadataUrl;
    const csvUrl = root.dataset.csvUrl;
    const jsonUrl = root.dataset.jsonUrl;

    root.innerHTML = `
        <div class="climate-index-header">
            <div>
                <div class="climate-index-kicker">
                    EL NIÑO–SOUTHERN OSCILLATION
                </div>

                <h2>Relative Oceanic Niño Index</h2>

                <div class="climate-index-subtitle">
                    RONI · NOAA Climate Prediction Center
                </div>
            </div>

            <div class="climate-index-current">
                <div id="roni-current-value">—</div>
                <div id="roni-current-period">Cargando...</div>
            </div>
        </div>

        <div id="roni-chart"></div>

        <div class="climate-index-footer">
            <div id="roni-update-info"></div>

            <div class="climate-index-downloads">
                <a href="${csvUrl}" target="_blank" rel="noopener">
                    Descargar CSV
                </a>

                <a href="${jsonUrl}" target="_blank" rel="noopener">
                    Descargar JSON
                </a>
            </div>
        </div>

        <div id="roni-error"></div>
    `;


    Promise.all([
        fetch(dataUrl).then(response => {
            if (!response.ok) {
                throw new Error("No se pudo cargar RONI");
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

        const time = records.map(record => record.date);
        const values = records.map(record => Number(record.roni));

        const periods = records.map(record =>
            `${record.season} ${record.year}`
        );

        const last = records[records.length - 1];


        // ----------------------------------------------------
        // Valor actual
        // ----------------------------------------------------

        document.getElementById("roni-current-value").textContent =
            `${last.roni > 0 ? "+" : ""}${Number(last.roni).toFixed(2)} °C`;

        document.getElementById("roni-current-period").textContent =
            `${last.season} ${last.year}`;


        // ----------------------------------------------------
        // Información de actualización
        // ----------------------------------------------------

        const retrieved = new Date(metadata.retrieved_utc);

        document.getElementById("roni-update-info").textContent =
            `Última consulta a la fuente: ${
                retrieved.toISOString().replace("T", " ").slice(0, 16)
            } UTC`;


        // ----------------------------------------------------
        // Período inicial mostrado: últimos 5 años
        // ----------------------------------------------------

        const endDate = new Date(
            `${last.date}T00:00:00Z`
        );

        const startDate = new Date(endDate);

        startDate.setUTCFullYear(
            startDate.getUTCFullYear() - 5
        );


        // ----------------------------------------------------
        // Serie Plotly
        // ----------------------------------------------------

        const trace = {
            x: time,
            y: values,

            customdata: periods,

            type: "scatter",
            mode: "lines",

            hovertemplate:
                "<b>%{customdata}</b><br>" +
                "RONI: %{y:.2f} °C" +
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
                    startDate.toISOString().slice(0, 10),
                    last.date
                ],

                rangeselector: {

                    buttons: [

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
                            count: 20,
                            label: "20 años",
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
                    text: "RONI [°C]"
                },

                zeroline: true,
                zerolinewidth: 1,

                showgrid: true
            },

            shapes: [

                {
                    type: "line",

                    xref: "paper",
                    x0: 0,
                    x1: 1,

                    y0: 0,
                    y1: 0,

                    line: {
                        width: 1
                    }
                }
            ],

            showlegend: false,

            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)"
        };


        const config = {

            responsive: true,

            displaylogo: false,

            scrollZoom: true,

            toImageButtonOptions: {
                format: "png",
                filename: "RONI"
            }
        };


        Plotly.newPlot(
            "roni-chart",
            [trace],
            layout,
            config
        );
    })


    .catch(error => {

        console.error(error);

        document.getElementById("roni-error").textContent =
            "No fue posible cargar los datos de RONI.";
    });

})();
