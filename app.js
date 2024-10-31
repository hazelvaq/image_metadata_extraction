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
    metadataArray = [];
    markers = {};
    allKeys.clear();

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
                            markers[file.name] = marker;
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
    return marker;
}

// CSV Download
function downloadCSV() {
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
    const geojsonData = {
        type: "FeatureCollection",
        features: metadataArray.map(entry => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [entry.Longitude || 0, entry.Latitude || 0]
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
async function downloadShapefile() {
    const geojsonData = {
        type: "FeatureCollection",
        features: metadataArray.map(entry => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [entry.Longitude || 0, entry.Latitude || 0]
            },
            properties: importantKeys.reduce((acc, key) => {
                acc[key] = entry[key] || "N/A";
                return acc;
            }, {})
        }))
    };

    const options = { folder: "metadata", types: { point: "metadata_points" } };
    const shp = await shpwrite.download(geojsonData, options);
}
