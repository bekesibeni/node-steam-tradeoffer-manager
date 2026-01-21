const FS = require('fs');
const Path = require('path');

const filesToDownload = {
	"resources/EResult.js": "https://raw.githubusercontent.com/DoctorMcKay/node-steam-user/master/enums/EResult.js"
};

(async () => {
	for (let destinationPath in filesToDownload) {
		const url = filesToDownload[destinationPath];
		const fullPath = Path.join(__dirname, "..", destinationPath);
		
		console.log("Downloading " + url + " -> " + fullPath);
		
		try {
			const response = await fetch(url, {
				headers: {
					'Accept-Encoding': 'gzip, deflate'
				}
			});
			
			if (!response.ok) {
				throw new Error("HTTP error " + response.status);
			}
			
			const body = await response.text();
			FS.writeFileSync(fullPath, body);
			console.log("Successfully downloaded " + destinationPath);
		} catch (err) {
			console.error("Error downloading " + destinationPath + ": " + err.message);
			throw err;
		}
	}
})();
