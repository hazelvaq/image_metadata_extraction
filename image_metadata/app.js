document.getElementById('fileInput').addEventListener('change', handleFiles);

let metadataArray = [];
let markers = {}; // Store markers by filename
let importantKeys = ["Filename", "Date", "Time", "Latitude", "Longitude", "Make", "Model"]; // Main columns for displayed metadata
let allKeys = new Set(); // Set to track all unique metadata keys across files

// Initialize Leaflet map
const map = L.map('map').setView([0, 0], 2); // Center map at a global level initially

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

function handleFiles(event) {
    const files = event.target.files;
    metadataArray = [];
    markers = {}; // Reset markers
    allKeys.clear(); // Clear allKeys for new files

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

                        // Track all metadata keys for optional full download
                        Object.keys(metadata).forEach(key => {
                            // Only add textual data keys, skipping non-text data
                            if (typeof metadata[key] === 'string' || typeof metadata[key] === 'number') {
                                allKeys.add(key);
                            }
                        });

                        // Extract and format Date and Time
                        if (metadata.DateTime) {
                            const [date, time] = metadata.DateTime.split(" ");
                            const [year, month, day] = date.split(":");
                            formattedData.Date = `${month}-${day}-${year}`;
                            formattedData.Time = time;
                        } else {
                            formattedData.Date = "N/A";
                            formattedData.Time = "N/A";
                        }

                        // Separate GPS Latitude and Longitude if present
                        const latitude = formatGPS(metadata.GPSLatitude, metadata.GPSLatitudeRef);
                        const longitude = formatGPS(metadata.GPSLongitude, metadata.GPSLongitudeRef);
                        formattedData.Latitude = latitude || "N/A";
                        formattedData.Longitude = longitude || "N/A";

                        // Add marker if valid coordinates exist
                        if (latitude && longitude) {
                            const marker = addMapMarker(latitude, longitude, file.name, img.src);
                            markers[file.name] = marker; // Store marker by filename
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
    tableBody.innerHTML = ""; // Clear existing table data
    
    metadataArray.forEach(entry => {
        const row = document.createElement('tr');
        row.classList.add('table-row'); // Add class for styling
        row.dataset.filename = entry.Filename; // Add filename for reference

        // Populate each cell
        importantKeys.forEach(key => {
            const cell = document.createElement('td');
            cell.textContent = entry[key] || 'N/A';
            row.appendChild(cell);
        });

        // Add click event listener to each row
        row.addEventListener('click', () => {
            const marker = markers[entry.Filename];
            if (marker) {
                map.setView(marker.getLatLng(), 12); // Zoom to the marker
                marker.openPopup(); // Open the popup with image thumbnail
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

function downloadCSV() {
    const allMetadataCheckbox = document.getElementById('allMetadataCheckbox').checked;

    // Create the ordered list of CSV columns
    const csvKeys = [...importantKeys]; // Start with main columns
    if (allMetadataCheckbox) {
        // Append additional keys (sorted alphabetically) while skipping duplicates
        const additionalKeys = Array.from(allKeys).filter(key => !importantKeys.includes(key)).sort();
        csvKeys.push(...additionalKeys);
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += csvKeys.map(header => `"${header}"`).join(",") + "\n"; // Quote headers for clarity

    metadataArray.forEach(entry => {
        const row = csvKeys.map(key => {
            const value = entry[key] || 'N/A';
            return `"${value}"`; // Quote each value to ensure readability
        });
        csvContent += row.join(",") + "\n"; // Join rows with commas
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "metadata.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
