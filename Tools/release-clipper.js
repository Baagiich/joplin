const fs = require('fs-extra');
const { execCommand } = require('./tool-utils.js');

const clipperDir = __dirname + '/../Clipper/joplin-webclipper';

async function copyDir(baseSourceDir, sourcePath, baseDestDir) {
	await fs.mkdirp(baseDestDir + '/' + sourcePath);
	await fs.copy(baseSourceDir + '/' + sourcePath, baseDestDir + '/' + sourcePath);
}

async function copyToDist(distDir) {
	await copyDir(clipperDir, 'popup/build', distDir);
	await copyDir(clipperDir, 'content_scripts', distDir);
	await copyDir(clipperDir, 'icons', distDir);
	await fs.copy(clipperDir + '/background.js', distDir + '/background.js');
	await fs.copy(clipperDir + '/main.js', distDir + '/main.js');
	await fs.copy(clipperDir + '/manifest.json', distDir + '/manifest.json');

	await fs.remove(distDir + '/popup/build/manifest.json');
}

async function updateManifestVersionNumber(manifestPath) {
	const manifestText = await fs.readFile(manifestPath, 'utf-8');
	let manifest = JSON.parse(manifestText);
	let v = manifest.version.split('.');
	const buildNumber = Number(v.pop()) + 1;
	v.push(buildNumber);
	manifest.version = v.join('.');
	console.info('New version: ' + manifest.version);
	await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 4));
}

async function main() {
	await updateManifestVersionNumber(clipperDir + '/manifest.json');

	console.info('Building extension...');
	process.chdir(clipperDir + '/popup');
	console.info(await execCommand('npm run build'));

	const dists = [
		{
			dir: clipperDir + '/dist/chrome',
			name: 'chrome',
			removeManifestKeys: (manifest) => {
				manifest = Object.assign({}, manifest);
				delete manifest.applications;
				return manifest;
			},
		},
		{
			dir: clipperDir + '/dist/firefox',
			name: 'firefox',
			removeManifestKeys: (manifest) => {
				manifest = Object.assign({}, manifest);
				delete manifest.background.persistent;
				return manifest;
			},
		}
	];

	for (let i = 0; i < dists.length; i++) {
		const dist = dists[i];
		await fs.remove(dist.dir);
		await fs.mkdirp(dist.dir);
		await copyToDist(dist.dir);

		const manifestText = await fs.readFile(dist.dir + '/manifest.json', 'utf-8');
		let manifest = JSON.parse(manifestText);
		manifest.name = 'Joplin Web Clipper';
		if (dist.removeManifestKeys) manifest = dist.removeManifestKeys(manifest);
		await fs.writeFile(dist.dir + '/manifest.json', JSON.stringify(manifest, null, 4));

		process.chdir(dist.dir);
		console.info(await execCommand('7z a -tzip ' + dist.name + '.zip *'));
		console.info(await execCommand('mv ' + dist.name + '.zip ..'));
	}
}

main().catch((error) => {
	console.error('Fatal error');
	console.error(error);
	process.exit(1);
});