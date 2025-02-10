document.getElementById('fileInput').addEventListener('change', handleFiles);

let metadataArray = [];
let markers = {};
let importantKeys = ["Filename", "Date", "Time", "Latitude", "Longitude", "Make", "Model"];
let allKeys = new Set();

const map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

function handleFiles(event) {
    const files = event.target.files;

    // Clear existing data
    metadataArray = [];
    allKeys.clear();

    // Remove existing markers from the map
    for (let key in markers) {
        map.removeLayer(markers[key]);
    }
    markers = {};

    // Clear the table
    const tableBody = document.getElementById('metadataTable').querySelector('tbody');
    tableBody.innerHTML = '';

    // Reset the map view
    map.setView([0, 0], 2);

    // Proceed with processing the new files
    const promises = Array.from(files).map((file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.src = e.target.result;
                img.onload = function() {
                    EXIF.getData(img, function() {
                        const metadata = EXIF.getAllTags(this);
                        const formattedData = {
                            Filename: file.name,
                            Make: metadata.Make || "N/A",
                            Model: metadata.Model || "N/A"
                        };

                        Object.keys(metadata).forEach(key => {
                            if (typeof metadata[key] === 'string' || typeof metadata[key] === 'number') {
                                allKeys.add(key);
                            }
                        });

                        if (metadata.DateTime) {
                            const [date, time] = metadata.DateTime.split(" ");
                            const [year, month, day] = date.split(":");
                            formattedData.Date = `${month}-${day}-${year}`;
                            formattedData.Time = time;
                        } else {
                            formattedData.Date = "N/A";
                            formattedData.Time = "N/A";
                        }

                        const latitude = formatGPS(metadata.GPSLatitude, metadata.GPSLatitudeRef);
                        const longitude = formatGPS(metadata.GPSLongitude, metadata.GPSLongitudeRef);
                        formattedData.Latitude = latitude || "N/A";
                        formattedData.Longitude = longitude || "N/A";

                        if (latitude && longitude) {
                            const marker = addMapMarker(latitude, longitude, file.name, img.src);
                            markers[file.name] = marker; // Store the marker
                        }

                        metadataArray.push({ ...formattedData, ...metadata });
                        resolve();
                    });
                };
            };
            reader.readAsDataURL(file);
        });
    });

    Promise.all(promises).then(() => {
        displayMetadataTable();
        plotTimeTrend(); // Create/update the time trend chart.
        zoomToMarkers(); // Zoom the map to include all markers.
    });
}

function displayMetadataTable() {
    const tableBody = document.getElementById('metadataTable').querySelector('tbody');
    tableBody.innerHTML = "";

    metadataArray.forEach(entry => {
        const row = document.createElement('tr');
        row.classList.add('table-row');
        row.dataset.filename = entry.Filename;

        importantKeys.forEach(key => {
            const cell = document.createElement('td');
            cell.textContent = entry[key] || 'N/A';
            row.appendChild(cell);
        });

        row.addEventListener('click', () => {
            const marker = markers[entry.Filename];
            if (marker) {
                map.setView(marker.getLatLng(), 12);
                marker.openPopup();
            }
        });

        tableBody.appendChild(row);
    });
}

function formatGPS(coordinate, reference) {
    if (!coordinate || !reference) return null;
    const [degrees, minutes, seconds] = coordinate;
    const decimal = degrees + minutes / 60 + seconds / 3600;
    return (reference === "S" || reference === "W") ? -decimal : decimal;
}

function addMapMarker(latitude, longitude, filename, imgSrc) {
    const marker = L.marker([latitude, longitude]).addTo(map);
    const popupContent = `<b>${filename}</b><br><img src="${imgSrc}" alt="${filename}" style="width: 100px; height: auto;"><br>Lat: ${latitude}, Lon: ${longitude}`;
    marker.bindPopup(popupContent);
    markers[filename] = marker; // Store the marker
    return marker;
}

// CSV Download
function downloadCSV() {
    if (metadataArray.length === 0) {
        alert('No metadata available to download.');
        return;
    }
    const csvKeys = [...importantKeys];
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += csvKeys.map(header => `"${header}"`).join(",") + "\n";

    metadataArray.forEach(entry => {
        const row = csvKeys.map(key => {
            const value = entry[key] || 'N/A';
            return `"${value}"`;
        });
        csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "metadata.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// GeoJSON Download
function downloadGeoJSON() {
    if (metadataArray.length === 0) {
        alert('No metadata available to download.');
        return;
    }
    const geojsonData = {
        type: "FeatureCollection",
        features: metadataArray.map(entry => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [parseFloat(entry.Longitude) || 0, parseFloat(entry.Latitude) || 0]
            },
            properties: importantKeys.reduce((acc, key) => {
                acc[key] = entry[key] || "N/A";
                return acc;
            }, {})
        }))
    };

    const blob = new Blob([JSON.stringify(geojsonData)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "metadata.geojson";
    link.click();
    URL.revokeObjectURL(url);
}

// Shapefile Download
function downloadShapefile() {
    if (metadataArray.length === 0) {
        alert('No metadata available to download.');
        return;
    }
    const geojsonData = {
        type: "FeatureCollection",
        features: metadataArray.map(entry => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [parseFloat(entry.Longitude) || 0, parseFloat(entry.Latitude) || 0]
            },
            properties: importantKeys.reduce((acc, key) => {
                acc[key] = entry[key] || "N/A";
                return acc;
            }, {})
        }))
    };

    const options = { folder: "metadata", types: { point: "metadata_points" } };
    shpwrite.download(geojsonData, options);
}

// Handle issue submission
// Report Issue Button Functionality
document.getElementById('reportIssueBtn').addEventListener('click', function() {
    window.open('https://github.com/Moore-Institute-4-Plastic-Pollution-Res/image_metadata_extraction/issues', '_blank');
  });


// Global variable for the time trend chart
let timeTrendChart = null;

function plotTimeTrend() {
    // If a chart already exists, destroy it so we can recreate it.
    if (timeTrendChart) {
        timeTrendChart.destroy();
    }

    // Filter metadata entries that have valid Date and Time values.
    const validData = metadataArray.filter(entry => entry.Date !== "N/A" && entry.Time !== "N/A");

    // Convert the Date and Time strings into Date objects.
    // Note: The Date is formatted as "MM-DD-YYYY" so we split and create a new Date.
    const timestamps = validData.map(entry => {
        const dateParts = entry.Date.split('-'); // [month, day, year]
        const timeParts = entry.Time.split(':'); // [hour, minute, second]
        if (dateParts.length === 3 && timeParts.length >= 2) {
            // Use 0 for seconds if not provided.
            const [month, day, year] = dateParts;
            const [hour, minute, second = "0"] = timeParts;
            return new Date(year, month - 1, day, hour, minute, second);
        }
        return null;
    }).filter(dateObj => dateObj !== null);

    // If no valid timestamps were found, do not create the chart.
    if (timestamps.length === 0) {
        return;
    }

    // Sort the timestamps in ascending order.
    timestamps.sort((a, b) => a - b);

    // Create data points for a cumulative count chart.
    const dataPoints = timestamps.map((timestamp, index) => ({
        x: timestamp, // a valid Date object
        y: index + 1
    }));


    // Get the context of the canvas element.
    const ctx = document.getElementById('timeTrendChart').getContext('2d');

// Create the Chart.js chart.
timeTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
        datasets: [{
            label: 'Cumulative Images Captured',
            data: dataPoints, // dataPoints: [{x: Date, y: count}, ...]
            fill: false,
            borderColor: 'rgba(75,192,192,1)',
            tension: 0.1,
        }]
    },
    options: {
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'day',
                    // Display format for the tick labels.
                    displayFormats: {
                        day: 'MMM DD, YYYY'
                    },
                    tooltipFormat: 'MMM DD, YYYY'
                },
                title: {
                    display: true,
                    text: 'Date'
                },
                ticks: {
                    // Disable auto-skip so that ticks always display.
                    autoSkip: false,
                    // Adjust rotation if needed
                    maxRotation: 45,
                    minRotation: 45
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Cumulative Count'
                },
                beginAtZero: true,
                ticks: {
                    precision: 0
                }
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const date = new Date(context.parsed.x);
                        return `${context.dataset.label}: ${context.parsed.y} (Captured on ${date.toLocaleString()})`;
                    }
                }
            }
        }
    }
});
}

function zoomToMarkers() {
    // Get all marker positions as an array of LatLng objects.
    const markerPositions = Object.values(markers).map(marker => marker.getLatLng());

    // Only proceed if there is at least one marker.
    if (markerPositions.length > 0) {
        // Create a LatLngBounds object that contains all marker positions.
        const bounds = L.latLngBounds(markerPositions);
        
        // Optionally, add padding around the bounds.
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

